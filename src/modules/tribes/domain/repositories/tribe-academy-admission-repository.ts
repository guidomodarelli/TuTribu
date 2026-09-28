/**
 * Port of the basic academy admission: an authenticated person enters an
 * academy-mode tribe as a `tribemate` without academy access.
 *
 * @module tribe-academy-admission-repository
 */

export type TribeAcademyAdmissionStatus =
  | "admission_closed"
  | "already_member"
  | "blocked"
  | "joined";

export type JoinTribeAcademyAdmissionCommand = {
  tribeSlug: string;
};

export type TribeAcademyAdmissionRepository = {
  join(command: JoinTribeAcademyAdmissionCommand): Promise<{
    status: TribeAcademyAdmissionStatus;
  }>;
};
