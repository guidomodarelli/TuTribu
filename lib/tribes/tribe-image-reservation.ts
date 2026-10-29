const TRIBE_IMAGES_ROUTE = {
  apiPrefix: "/api/tribes/",
  imagesSegment: "/images",
  pathSeparator: "/",
} as const;

const TRIBE_IMAGES_REQUEST = {
  deleteMethod: "DELETE",
} as const;

/** Direct upload reserved for a tribe image. */
export type TribeImageReservation = {
  /** URL the image is served from once uploaded. */
  deliveryUrl: string;
  imageId: string;
  /** One-time URL the binary is posted to. */
  uploadUrl: string;
};

/**
 * Endpoint that reserves (POST) and releases (DELETE on a child path) the
 * leader-only direct uploads of a tribe.
 * @param tribeSlug - Tribe slug.
 * @returns The tribe images endpoint.
 */
export function buildTribeImagesEndpoint(tribeSlug: string): string {
  return (
    TRIBE_IMAGES_ROUTE.apiPrefix + tribeSlug + TRIBE_IMAGES_ROUTE.imagesSegment
  );
}

/**
 * Reads the answer of an image reservation request.
 * @param reserveResponse - Response of the reservation request.
 * @returns The reservation, or `null` when the request failed or the answer is
 * incomplete, plus the server message, if any.
 */
export async function readTribeImageReservation(
  reserveResponse: Response
): Promise<{ message?: string; reservation: TribeImageReservation | null }> {
  const reserveBody = (await reserveResponse.json().catch(() => ({}))) as {
    deliveryUrl?: string;
    imageId?: string;
    message?: string;
    uploadUrl?: string;
  };

  if (
    !reserveResponse.ok ||
    !reserveBody.uploadUrl ||
    !reserveBody.deliveryUrl ||
    !reserveBody.imageId
  ) {
    return { message: reserveBody.message, reservation: null };
  }

  return {
    message: reserveBody.message,
    reservation: {
      deliveryUrl: reserveBody.deliveryUrl,
      imageId: reserveBody.imageId,
      uploadUrl: reserveBody.uploadUrl,
    },
  };
}

/**
 * Releases, best-effort, a reservation whose binary upload failed.
 * @param tribeSlug - Tribe slug.
 * @param imageId - Reserved image.
 */
export function releaseTribeImageReservation(
  tribeSlug: string,
  imageId: string
): void {
  void fetch(
    buildTribeImagesEndpoint(tribeSlug) +
      TRIBE_IMAGES_ROUTE.pathSeparator +
      imageId,
    { method: TRIBE_IMAGES_REQUEST.deleteMethod }
  ).catch(() => {
    // Deliberate no-op: the reservation stays a draft, is never attached and
    // the sweep reclaims it.
  });
}
