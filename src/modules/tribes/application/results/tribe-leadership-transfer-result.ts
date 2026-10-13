/** Guards the owner-controlled original transfer metadata without exposing any credential or native session. @module tribe-leadership-transfer-result */
import { z } from "zod";
import { TRIBE_FORMER_LEADER_ROLE } from "../../constants/tribe-leadership";

/** Internal native user ids are opaque; connection references are public UUIDs within the authenticated tribe. */
export const tribeLeadershipTransferResultSchema=z.strictObject({previousLeaderUserId:z.string().min(1),leaderUserId:z.string().min(1),formerLeaderRole:z.enum(TRIBE_FORMER_LEADER_ROLE),suspendedConnectionIds:z.array(z.uuid())});
