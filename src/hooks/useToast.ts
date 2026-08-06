import { toast } from "sonner";

type ToastVariant = "success" | "error" | "warning" | "info" | "loading";

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function useToast() {
  const showToast = (
    message: string,
    variant: ToastVariant = "info",
    options?: ToastOptions
  ) => {
    const { description, duration = 4000, action } = options || {};

    switch (variant) {
      case "success":
        toast.success(message, {
          description,
          duration,
          action: action ? { label: action.label, onClick: action.onClick } : undefined,
          className: "font-semibold",
        });
        break;
      case "error":
        toast.error(message, {
          description,
          duration,
          action: action ? { label: action.label, onClick: action.onClick } : undefined,
          className: "font-semibold",
        });
        break;
      case "warning":
        toast.warning(message, {
          description,
          duration,
          action: action ? { label: action.label, onClick: action.onClick } : undefined,
          className: "font-semibold",
        });
        break;
      case "loading":
        toast.loading(message, {
          description,
          duration,
          className: "font-semibold",
        });
        break;
      default:
        toast(message, {
          description,
          duration,
          action: action ? { label: action.label, onClick: action.onClick } : undefined,
          className: "font-semibold",
        });
        break;
    }
  };

  const dismiss = () => toast.dismiss();
  const promise = <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ) => {
    return toast.promise(promise, messages, { className: "font-semibold" });
  };

  return {
    toast: showToast,
    showToast,
    success: (message: string, options?: ToastOptions | string) =>
      typeof options === "string"
        ? showToast(message, "success", { description: options })
        : showToast(message, "success", options as ToastOptions),
    error: (message: string, options?: ToastOptions | string) =>
      typeof options === "string"
        ? showToast(message, "error", { description: options })
        : showToast(message, "error", options as ToastOptions),
    info: (message: string, options?: ToastOptions | string) =>
      typeof options === "string"
        ? showToast(message, "info", { description: options })
        : showToast(message, "info", options as ToastOptions),
    warning: (message: string, options?: ToastOptions | string) =>
      typeof options === "string"
        ? showToast(message, "warning", { description: options })
        : showToast(message, "warning", options as ToastOptions),
    loading: (message: string, options?: ToastOptions | string) =>
      typeof options === "string"
        ? showToast(message, "loading", { description: options })
        : showToast(message, "loading", options as ToastOptions),
    dismiss,
    promise,
  };
}
