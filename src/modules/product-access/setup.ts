/**
 * Composes the academy product access use cases with their ports.
 *
 * @module product-access-setup
 */

import type {
  OwnAcademyRenewalReader,
  OwnVerificationStatesReader,
} from "@/src/modules/product-access/application/ports/academy-cross-module-readers";
import {
  activateAcademy,
  getAcademyPublicOffer,
  getAcademySettings,
  getOwnAcademyAccess,
  grantAcademyBonus,
  listAcademyMembers,
  revokeAcademyBonus,
  saveAcademyOffer,
  setAcademyAvailability,
  type ProductAccessClock,
} from "@/src/modules/product-access/application/use-cases/manage-academy-access-use-cases";
import type { ProductAccessRepository } from "@/src/modules/product-access/domain/repositories/product-access-repository";

type ProductAccessModuleDependencies = {
  isAcademySalesActivationAllowed: () => boolean;
  now: ProductAccessClock;
  ownAcademyRenewalReader: OwnAcademyRenewalReader;
  ownVerificationStatesReader: OwnVerificationStatesReader;
  productAccessRepository: ProductAccessRepository;
};

export function buildProductAccessModule({
  isAcademySalesActivationAllowed,
  now,
  ownAcademyRenewalReader,
  ownVerificationStatesReader,
  productAccessRepository,
}: ProductAccessModuleDependencies) {
  return {
    useCases: {
      activateAcademy: activateAcademy({ productAccessRepository }),
      getAcademyPublicOffer: getAcademyPublicOffer({ productAccessRepository }),
      getAcademySettings: getAcademySettings({ productAccessRepository }),
      getOwnAcademyAccess: getOwnAcademyAccess({
        isAcademySalesActivationAllowed,
        now,
        ownAcademyRenewalReader,
        ownVerificationStatesReader,
        productAccessRepository,
      }),
      grantAcademyBonus: grantAcademyBonus({ now, productAccessRepository }),
      listAcademyMembers: listAcademyMembers({ productAccessRepository }),
      revokeAcademyBonus: revokeAcademyBonus({ productAccessRepository }),
      saveAcademyOffer: saveAcademyOffer({ productAccessRepository }),
      setAcademyAvailability: setAcademyAvailability({
        isAcademySalesActivationAllowed,
        productAccessRepository,
      }),
    },
  };
}
