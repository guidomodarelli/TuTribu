import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { ChevronsUpDownIcon } from "lucide-react";
import styles from "./styles.module.scss";

type GoogleAccountAvatarProps = {
  email: string;
  fallback: string;
  image: string | null;
  name: string;
};

export function GoogleAccountAvatar({
  email,
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
      <span className={styles.GoogleAccountAvatar__identity}>
        <span className={styles.GoogleAccountAvatar__name}>{name}</span>
        <span className={styles.GoogleAccountAvatar__email}>{email}</span>
      </span>
      <ChevronsUpDownIcon aria-hidden className={styles.GoogleAccountAvatar__chevron} />
    </div>
  );
}
