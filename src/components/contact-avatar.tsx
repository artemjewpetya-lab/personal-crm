import { cn } from "@/lib/utils";

// Avatar colors from the landing; each contact always gets the same one
const TONES = [
  "bg-rose text-white",
  "bg-ochre text-white",
  "bg-ink text-white",
  "bg-dusty text-plum",
];

/** "Анна Смирнова" -> "АС", "Марина (свадьба)" -> "МС" */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function toneFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

export function ContactAvatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-heading font-semibold",
        toneFor(id),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
