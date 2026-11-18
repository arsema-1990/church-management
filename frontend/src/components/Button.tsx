import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'outline' | 'danger';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  danger: 'btn-outline-danger',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: Props) {
  return (
    <button
      {...props}
      type={type}
      className={`${variantClass[variant]} ${className}`.trim()}
    />
  );
}
