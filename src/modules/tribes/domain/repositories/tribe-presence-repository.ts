export type TouchTribePresenceCommand = {
  tribeSlug: string;
};

export type TribePresenceRepository = {
  touchByTribeSlug(command: TouchTribePresenceCommand): Promise<boolean>;
};
