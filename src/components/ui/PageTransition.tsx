import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return className ? <div className={className}>{children}</div> : <>{children}</>;
}

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ animation: `fadeIn 0.5s ${delay}s ease-out both` }}
    >
      {children}
    </div>
  );
}

export function StaggerList({
  children,
  className,
  staggerDelay = 0.05,
}: {
  children: ReactNode[];
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          style={{
            animation: `fadeIn 0.4s ${i * staggerDelay}s ease-out both`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

export function ScaleIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ animation: `scaleIn 0.4s ${delay}s ease-out both` }}
    >
      {children}
    </div>
  );
}
