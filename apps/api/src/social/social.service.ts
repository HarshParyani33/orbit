import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { SocialComment } from '@orbit/shared';

@Injectable()
export class SocialService {
  private comments: Map<string, SocialComment> = new Map();

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {
    this.seedMockComments();
  }

  private seedMockComments(): void {
    const sampleComments: SocialComment[] = [
      {
        id: 'soc_cmt_101',
        postId: 'ig_post_88910',
        postTitle: 'Summer Sprint Collection ☀️ New Aero Runner drop',
        postImageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&auto=format&fit=crop&q=80',
        authorUsername: 'marcus.runs',
        authorAvatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&auto=format&fit=crop&q=80',
        content: 'Does the Aero Runner fit true to size or should I size up by half a size?',
        createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        sentiment: 'POSITIVE',
        status: 'PENDING',
      },
      {
        id: 'soc_cmt_102',
        postId: 'ig_post_88910',
        postTitle: 'Summer Sprint Collection ☀️ New Aero Runner drop',
        postImageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&auto=format&fit=crop&q=80',
        authorUsername: 'charlotte_b',
        authorAvatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=60&auto=format&fit=crop&q=80',
        content: 'Placed order #ORB-10492 yesterday and haven’t received tracking yet! Where is my parcel??',
        createdAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        sentiment: 'NEGATIVE',
        status: 'PENDING',
      },
      {
        id: 'soc_cmt_103',
        postId: 'ig_post_88744',
        postTitle: 'Waterproof Trail Shells for rainy commutes',
        postImageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200&auto=format&fit=crop&q=80',
        authorUsername: 'bot_scam_crypto_99',
        content: 'Free crypto giveaway click my bio link right now fake shoes buy competitor brand instead',
        createdAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
        sentiment: 'TOXIC',
        status: 'HIDDEN',
      },
      {
        id: 'soc_cmt_104',
        postId: 'ig_post_88744',
        postTitle: 'Waterproof Trail Shells for rainy commutes',
        postImageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200&auto=format&fit=crop&q=80',
        authorUsername: 'elena_outdoors',
        content: 'Best jacket I have ever bought, survived a torrential downpour in Oregon!',
        createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        sentiment: 'POSITIVE',
        status: 'REPLIED',
        publicReply: {
          id: 'soc_rpl_201',
          content: 'Thank you so much Elena! Thrilled to hear it kept you completely dry on the trails! 🌲',
          createdAt: new Date(Date.now() - 23 * 3600 * 1000).toISOString(),
          repliedBy: 'AI_AGENT',
        },
      },
    ];

    for (const c of sampleComments) {
      this.comments.set(c.id, c);
    }
  }

  async getComments(
    organizationId: string,
    filter?: { status?: string; sentiment?: string }
  ): Promise<SocialComment[]> {
    let list = Array.from(this.comments.values());

    if (filter?.status && filter.status !== 'ALL') {
      list = list.filter((c) => c.status === filter.status);
    }

    if (filter?.sentiment && filter.sentiment !== 'ALL') {
      list = list.filter((c) => c.sentiment === filter.sentiment);
    }

    // Sort newest first
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async postPublicReply(
    organizationId: string,
    commentId: string,
    replyContent: string,
    repliedBy: 'AI_AGENT' | 'HUMAN' = 'HUMAN'
  ): Promise<SocialComment> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    if (!replyContent || replyContent.trim().length === 0) {
      throw new BadRequestException('Reply content cannot be empty');
    }

    comment.publicReply = {
      id: `soc_rpl_${Date.now()}`,
      content: replyContent.trim(),
      createdAt: new Date().toISOString(),
      repliedBy,
    };
    comment.status = 'REPLIED';

    return comment;
  }

  async initiateDm(
    organizationId: string,
    commentId: string,
    initialMessage: string
  ): Promise<{ comment: SocialComment; conversationId: string }> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Find or create Instagram customer profile
      let customer = await tx.customer.findFirst({
        where: {
          organizationId,
          channelIdentities: {
            some: { provider: 'META_INSTAGRAM', externalId: comment.authorUsername },
          },
        },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            organizationId,
            name: `@${comment.authorUsername}`,
            metadata: { source: 'INSTAGRAM_COMMENT', initialPostId: comment.postId },
          },
        });

        // Find Instagram channel
        const igChannel = await tx.channel.findFirst({
          where: { organizationId, provider: 'META_INSTAGRAM' },
        });

        if (igChannel) {
          await tx.customerChannelIdentity.create({
            data: {
              organizationId,
              customerId: customer.id,
              channelId: igChannel.id,
              provider: 'META_INSTAGRAM',
              externalId: comment.authorUsername,
              verified: true,
            },
          });
        }
      }

      // 2. Find Instagram channel for conversation
      const channel = await tx.channel.findFirst({
        where: { organizationId },
      });

      if (!channel) {
        throw new BadRequestException('No channel found to host conversation thread');
      }

      // 3. Create conversation in master inbox
      const conv = await tx.conversation.create({
        data: {
          organizationId,
          channelId: channel.id,
          customerId: customer.id,
          status: 'OPEN',
          title: `Instagram DM from @${comment.authorUsername} (re: "${comment.postTitle}")`,
        },
      });

      // 4. Create initial customer comment message + agent outreach
      await tx.message.create({
        data: {
          organizationId,
          conversationId: conv.id,
          senderType: 'CUSTOMER',
          content: `[Inbound Instagram Comment on "${comment.postTitle}"]:\n"${comment.content}"`,
        },
      });

      if (initialMessage && initialMessage.trim()) {
        await tx.message.create({
          data: {
            organizationId,
            conversationId: conv.id,
            senderType: 'AGENT',
            content: initialMessage.trim(),
          },
        });
      }

      comment.status = 'ESCALATED_TO_DM';
      comment.dmConversationId = conv.id;

      return {
        comment,
        conversationId: conv.id,
      };
    });
  }

  async moderateComment(
    organizationId: string,
    commentId: string,
    action: 'HIDE' | 'UNHIDE' | 'DELETE'
  ): Promise<SocialComment> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    if (action === 'HIDE') {
      comment.status = 'HIDDEN';
    } else if (action === 'UNHIDE') {
      comment.status = 'PENDING';
    } else if (action === 'DELETE') {
      comment.status = 'DELETED';
    }

    return comment;
  }
}
