import mark from "@/assets/vitaminku-mark.png";

export function Logo({
  className = "h-8 w-8",
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <img
        src={mark}
        alt="Logo VitaminKu"
        className={`${className} object-contain`}
        loading="eager"
      />
      {showWordmark ? (
        <span className="text-lg font-extrabold tracking-tight text-navy">
          Vitamin<span className="text-primary">Ku</span>
        </span>
      ) : (
        <span className="sr-only">VitaminKu</span>
      )}
    </span>
  );
}
