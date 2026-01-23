import { cn } from "@/lib/utils"

interface IconProps {
  name: string
  className?: string
  filled?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
}

export function Icon({ name, className, filled, size = 'md' }: IconProps) {
  return (
    <span
      className={cn(
        "material-symbols-outlined select-none",
        filled && "filled",
        sizeClasses[size],
        className
      )}
    >
      {name}
    </span>
  )
}
