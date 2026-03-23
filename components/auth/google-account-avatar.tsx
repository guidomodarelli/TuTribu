import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

type GoogleAccountAvatarProps = {
  fallback: string;
  image: string | null;
  name: string;
};

export function GoogleAccountAvatar({
  fallback,
  image,
  name,
}: GoogleAccountAvatarProps) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-border/80 bg-background/80 px-3 py-1.5 transition-[padding] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-1.5">
      <Avatar size="sm">
        {image ? <AvatarImage alt={name} src={image} /> : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden md:text-sm">
        {name}
      </span>
    </div>
  );
}
