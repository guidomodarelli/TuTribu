import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import styles from "./styles.module.scss";

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
    <div className={styles.GoogleAccountAvatar}>
      <Avatar size="sm">
        {image ? <AvatarImage alt={name} src={image} /> : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <span className={styles.GoogleAccountAvatar__name}>
        {name}
      </span>
    </div>
  );
}
