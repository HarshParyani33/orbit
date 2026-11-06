import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
      secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 focus:ring-slate-400',
      danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-400',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
    };

    return React.createElement(
      'button',
      {
        ref,
        disabled: disabled || isLoading,
        className: `${base} ${variants[variant]} ${sizes[size]} ${className}`,
        ...props,
      },
      isLoading ? 'Loading...' : children
    );
  }
);
Button.displayName = 'Button';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className = '', children, ...props }, ref) => {
  return React.createElement(
    'div',
    {
      ref,
      className: `bg-white rounded-xl border border-slate-200 shadow-sm p-6 ${className}`,
      ...props,
    },
    children
  );
});
Card.displayName = 'Card';
