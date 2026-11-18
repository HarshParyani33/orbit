/**
 * Project Orbit — Embeddable Customer Chat Widget (apps/widget)
 *
 * Lightweight, zero-dependency, embeddable script for customer websites.
 * Connects directly to Project Orbit API widget endpoints with visitor session persistence.
 */

import { WidgetSessionInitResponse, WidgetConversationResponse } from '@orbit/shared';

export const WIDGET_VERSION = '0.2.0';

export interface OrbitWidgetConfig {
  channelId: string;
  apiUrl?: string;
  themeColor?: string;
  title?: string;
  welcomeMessage?: string;
  customerProfile?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  position?: 'bottom-right' | 'bottom-left';
}

export interface ChatMessage {
  id: string;
  senderType: 'CUSTOMER' | 'AGENT' | 'AI' | 'SYSTEM' | string;
  content: string;
  createdAt: string;
}

export class OrbitChatWidget {
  private config: OrbitWidgetConfig;
  private apiUrl: string;
  private visitorId: string | null = null;
  private visitorToken: string | null = null;
  private conversationId: string | null = null;
  private messages: ChatMessage[] = [];

  private isOpen = false;
  private isLoading = false;
  private containerEl: HTMLElement | null = null;
  private launcherEl: HTMLElement | null = null;
  private windowEl: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private pollInterval: any = null;

  constructor(config: OrbitWidgetConfig) {
    if (!config?.channelId) {
      throw new Error('[OrbitWidget] channelId is required to initialize widget');
    }
    this.config = {
      themeColor: '#4F46E5',
      position: 'bottom-right',
      title: 'Customer Support',
      welcomeMessage: 'Hi there! How can we help you today?',
      ...config,
    };
    this.apiUrl = (config.apiUrl || 'http://localhost:4000').replace(/\/+$/, '');
  }

  /**
   * Initializes session, loads conversation history, and mounts widget into DOM
   */
  async init(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return; // Headless / SSR environment guard
    }

    // 1. Recover stored visitor credentials from localStorage
    try {
      this.visitorId = localStorage.getItem(`orbit_visitor_id_${this.config.channelId}`);
      this.visitorToken = localStorage.getItem(`orbit_visitor_token_${this.config.channelId}`);
    } catch {
      // Storage access may be blocked in strict sandboxes
    }

    // 2. Initialize or resume session with backend
    try {
      this.isLoading = true;
      const res = await fetch(`${this.apiUrl}/api/widget/session/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: this.config.channelId,
          visitorId: this.visitorId || undefined,
          customerProfile: this.config.customerProfile,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to initialize session: HTTP ${res.status}`);
      }

      const data: WidgetSessionInitResponse = await res.json();
      this.visitorId = data.visitorId;
      this.visitorToken = data.visitorToken;
      this.conversationId = data.conversationId;

      if (data.channel?.name) {
        this.config.title = data.channel.name;
      }
      if (data.channel?.welcomeMessage) {
        this.config.welcomeMessage = data.channel.welcomeMessage;
      }
      if (data.channel?.themeColor) {
        this.config.themeColor = data.channel.themeColor;
      }

      // Persist verified session
      try {
        localStorage.setItem(`orbit_visitor_id_${this.config.channelId}`, this.visitorId);
        localStorage.setItem(`orbit_visitor_token_${this.config.channelId}`, this.visitorToken);
      } catch {
        // Ignore storage exceptions
      }

      // 3. Load conversation history
      await this.loadMessages();
    } catch (err) {
      console.error('[OrbitWidget] Session initialization error:', err);
    } finally {
      this.isLoading = false;
    }

    // 4. Render DOM
    this.render();

    // 5. Poll for updates every 4 seconds
    this.startPolling();
  }

  /**
   * Fetches latest conversation messages
   */
  async loadMessages(): Promise<void> {
    if (!this.visitorToken) return;

    try {
      const res = await fetch(`${this.apiUrl}/api/widget/conversation`, {
        headers: {
          Authorization: `Bearer ${this.visitorToken}`,
        },
      });

      if (res.ok) {
        const data: WidgetConversationResponse = await res.json();
        this.messages = data.messages || [];
        this.updateMessagesDOM();
      }
    } catch (err) {
      console.warn('[OrbitWidget] Could not poll conversation history:', err);
    }
  }

  /**
   * Sends a message from the visitor
   */
  async sendMessage(content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed || !this.visitorToken) return;

    // Optimistically append customer message
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      senderType: 'CUSTOMER',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(tempMsg);
    this.updateMessagesDOM();

    if (this.inputEl) {
      this.inputEl.value = '';
    }

    try {
      const res = await fetch(`${this.apiUrl}/api/widget/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.visitorToken}`,
        },
        body: JSON.stringify({ content: trimmed }),
      });

      if (!res.ok) {
        throw new Error(`Send message failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.message) {
        // Replace temp message with server message
        const idx = this.messages.findIndex((m) => m.id === tempMsg.id);
        if (idx !== -1) {
          this.messages[idx] = data.message;
        }
        this.updateMessagesDOM();
      }
    } catch (err) {
      console.error('[OrbitWidget] Failed to send message:', err);
    }
  }

  /**
   * Toggles widget open/closed
   */
  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.windowEl) {
      this.windowEl.style.display = this.isOpen ? 'flex' : 'none';
    }
    if (this.isOpen && this.inputEl) {
      this.inputEl.focus();
      this.scrollToBottom();
    }
  }

  /**
   * Renders the floating chat button and chat window
   */
  private render(): void {
    if (typeof document === 'undefined') return;

    // Container
    this.containerEl = document.createElement('div');
    this.containerEl.id = 'orbit-chat-widget-root';
    this.containerEl.style.position = 'fixed';
    this.containerEl.style.zIndex = '999999';
    this.containerEl.style.bottom = '20px';
    if (this.config.position === 'bottom-left') {
      this.containerEl.style.left = '20px';
    } else {
      this.containerEl.style.right = '20px';
    }
    this.containerEl.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    // Launcher Button
    this.launcherEl = document.createElement('button');
    this.launcherEl.id = 'orbit-widget-launcher';
    this.launcherEl.setAttribute('aria-label', 'Open support chat');
    this.launcherEl.style.width = '56px';
    this.launcherEl.style.height = '56px';
    this.launcherEl.style.borderRadius = '28px';
    this.launcherEl.style.backgroundColor = this.config.themeColor || '#4F46E5';
    this.launcherEl.style.color = '#FFFFFF';
    this.launcherEl.style.border = 'none';
    this.launcherEl.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.25)';
    this.launcherEl.style.cursor = 'pointer';
    this.launcherEl.style.display = 'flex';
    this.launcherEl.style.alignItems = 'center';
    this.launcherEl.style.justifyContent = 'center';
    this.launcherEl.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    this.launcherEl.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;

    this.launcherEl.onclick = () => this.toggle();

    // Chat Window
    this.windowEl = document.createElement('div');
    this.windowEl.id = 'orbit-widget-window';
    this.windowEl.style.position = 'absolute';
    this.windowEl.style.bottom = '70px';
    if (this.config.position === 'bottom-left') {
      this.windowEl.style.left = '0';
    } else {
      this.windowEl.style.right = '0';
    }
    this.windowEl.style.width = '360px';
    this.windowEl.style.height = '520px';
    this.windowEl.style.maxHeight = 'calc(100vh - 100px)';
    this.windowEl.style.maxWidth = 'calc(100vw - 40px)';
    this.windowEl.style.backgroundColor = '#FFFFFF';
    this.windowEl.style.borderRadius = '16px';
    this.windowEl.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.18)';
    this.windowEl.style.display = 'none';
    this.windowEl.style.flexDirection = 'column';
    this.windowEl.style.overflow = 'hidden';
    this.windowEl.style.border = '1px solid #E2E8F0';

    // Window Header
    const header = document.createElement('div');
    header.style.padding = '14px 16px';
    header.style.backgroundColor = this.config.themeColor || '#4F46E5';
    header.style.color = '#FFFFFF';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';

    const headerTitle = document.createElement('div');
    headerTitle.style.display = 'flex';
    headerTitle.style.alignItems = 'center';
    headerTitle.style.gap = '8px';
    headerTitle.innerHTML = `
      <div style="width: 8px; height: 8px; border-radius: 4px; background-color: #34D399;"></div>
      <span style="font-weight: 600; font-size: 14px;">${this.config.title}</span>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#FFFFFF';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px';
    closeBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeBtn.onclick = () => this.toggle();

    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    // Messages Container
    this.messagesEl = document.createElement('div');
    this.messagesEl.style.flex = '1';
    this.messagesEl.style.padding = '16px';
    this.messagesEl.style.overflowY = 'auto';
    this.messagesEl.style.display = 'flex';
    this.messagesEl.style.flexDirection = 'column';
    this.messagesEl.style.gap = '10px';
    this.messagesEl.style.backgroundColor = '#F8FAFC';

    // Footer / Input Area
    const footer = document.createElement('form');
    footer.style.padding = '12px 14px';
    footer.style.borderTop = '1px solid #E2E8F0';
    footer.style.display = 'flex';
    footer.style.gap = '8px';
    footer.style.backgroundColor = '#FFFFFF';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Type a message...';
    this.inputEl.style.flex = '1';
    this.inputEl.style.padding = '8px 12px';
    this.inputEl.style.border = '1px solid #CBD5E1';
    this.inputEl.style.borderRadius = '8px';
    this.inputEl.style.fontSize = '13px';
    this.inputEl.style.outline = 'none';

    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.style.backgroundColor = this.config.themeColor || '#4F46E5';
    sendBtn.style.color = '#FFFFFF';
    sendBtn.style.border = 'none';
    sendBtn.style.borderRadius = '8px';
    sendBtn.style.padding = '8px 12px';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    `;

    footer.onsubmit = (e) => {
      e.preventDefault();
      if (this.inputEl) {
        this.sendMessage(this.inputEl.value);
      }
    };

    footer.appendChild(this.inputEl);
    footer.appendChild(sendBtn);

    this.windowEl.appendChild(header);
    this.windowEl.appendChild(this.messagesEl);
    this.windowEl.appendChild(footer);

    this.containerEl.appendChild(this.windowEl);
    this.containerEl.appendChild(this.launcherEl);
    document.body.appendChild(this.containerEl);

    this.updateMessagesDOM();
  }

  /**
   * Refreshes the DOM of the message history list
   */
  private updateMessagesDOM(): void {
    if (!this.messagesEl) return;
    this.messagesEl.innerHTML = '';

    // Welcome message if configured
    if (this.config.welcomeMessage) {
      const welcome = document.createElement('div');
      welcome.style.alignSelf = 'flex-start';
      welcome.style.backgroundColor = '#EEF2F6';
      welcome.style.color = '#334155';
      welcome.style.padding = '10px 14px';
      welcome.style.borderRadius = '12px 12px 12px 2px';
      welcome.style.fontSize = '13px';
      welcome.style.maxWidth = '80%';
      welcome.style.lineHeight = '1.4';
      welcome.textContent = this.config.welcomeMessage;
      this.messagesEl.appendChild(welcome);
    }

    for (const msg of this.messages) {
      const bubble = document.createElement('div');
      const isCustomer = msg.senderType === 'CUSTOMER';

      bubble.style.maxWidth = '80%';
      bubble.style.padding = '8px 12px';
      bubble.style.fontSize = '13px';
      bubble.style.lineHeight = '1.4';
      bubble.style.wordBreak = 'break-word';

      if (isCustomer) {
        bubble.style.alignSelf = 'flex-end';
        bubble.style.backgroundColor = this.config.themeColor || '#4F46E5';
        bubble.style.color = '#FFFFFF';
        bubble.style.borderRadius = '12px 12px 2px 12px';
      } else {
        bubble.style.alignSelf = 'flex-start';
        bubble.style.backgroundColor = '#FFFFFF';
        bubble.style.color = '#1E293B';
        bubble.style.borderRadius = '12px 12px 12px 2px';
        bubble.style.border = '1px solid #E2E8F0';
      }

      bubble.textContent = msg.content;
      this.messagesEl.appendChild(bubble);
    }

    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  private startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (this.isOpen) {
        this.loadMessages();
      }
    }, 4000);
  }

  /**
   * Tear down DOM and intervals
   */
  destroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl);
      this.containerEl = null;
    }
  }
}

/**
 * Global factory helper for script tags
 */
export function createOrbitWidget(config: OrbitWidgetConfig): OrbitChatWidget {
  const widget = new OrbitChatWidget(config);
  widget.init();
  return widget;
}

// Global window registration if running in browser
if (typeof window !== 'undefined') {
  (window as any).OrbitWidget = {
    init: createOrbitWidget,
    OrbitChatWidget,
    VERSION: WIDGET_VERSION,
  };
}
