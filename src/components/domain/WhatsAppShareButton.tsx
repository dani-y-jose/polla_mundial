import { cn } from "@/components/ui";

// WhatsApp share link — dedupes the icon + styling pasted twice in group detail.
// The caller builds the `message` (it's group-specific); this owns the brand
// button shell and the share URL.
export type WhatsAppShareButtonProps = {
  message: string;
  children?: React.ReactNode;
  className?: string;
};

export function WhatsAppShareButton({
  message,
  children = "Compartir en WhatsApp",
  className,
}: WhatsAppShareButtonProps) {
  return (
    <a
      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "w-full py-2.5 bg-[#25D366] hover:bg-[#1eb455] text-[#0b3d20] font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors",
        className,
      )}
    >
      <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24" aria-hidden>
        <path d="M12.012 1.985c-5.522 0-10 4.478-10 10 0 1.772.463 3.518 1.342 5.062L2.012 22.015l5.127-1.342a9.92 9.92 0 0 0 4.873 1.28c5.522 0 10-4.478 10-10 0-5.522-4.478-10-10-10zm-.012 1.5c4.687 0 8.5 3.813 8.5 8.5s-3.813 8.5-8.5 8.5a8.423 8.423 0 0 1-4.14-1.09l-.297-.176-3.08.808.82-3.003-.193-.307A8.441 8.441 0 0 1 3.5 11.985c0-4.687 3.813-8.5 8.5-8.5zm-3.666 3.86a.916.916 0 0 0-.646.3c-.22.235-.58.643-.58 1.488s.614 1.666.7 1.784c.086.117 1.18 1.91 2.937 2.585.418.16.744.256.998.337.42.13.8.113 1.102.068.337-.05 1.037-.425 1.182-.835s.145-.765.1-.835c-.045-.07-.164-.117-.344-.207s-1.037-.512-1.197-.57-.275-.086-.39.085c-.117.17-.45.57-.55.683-.1.117-.2.13-.38.04-1.74-.87-2.316-1.782-2.52-2.13-.086-.152-.01-.235.066-.31.068-.068.152-.178.228-.266.075-.09.1-.152.152-.255a.35.35 0 0 0-.018-.344c-.045-.09-.39-.938-.535-1.287-.14-.34-.296-.29-.406-.296-.105-.005-.226-.005-.347-.005z" />
      </svg>
      {children}
    </a>
  );
}
