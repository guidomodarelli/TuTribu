/** Turns the connection workspace's operation outcomes into toasts: `toast.promise` for writes, plain toasts for explicit reads. Persistent states stay in the page. @module messaging-connections-feedback */
import {toast} from "@golfo/ui";
import {MESSAGING_CONNECTIONS_UI_COPY} from "@/src/modules/messaging/constants/messaging-connections-browser";

/** One operation outcome; `alert` is a failure or a recoverable error. */
export type MessagingConnectionsFeedback={kind:"status"|"alert";text:string};

/** Carries an `alert` outcome through the rejected branch of `toast.promise`, so the toast shows the error tone. */
class MessagingConnectionsFeedbackError extends Error{
  /** @param text - Safe Spanish copy already mapped from the outcome. */
  constructor(text:string){super(text);this.name="MessagingConnectionsFeedbackError";}
}


/**
 * Runs one write under a single toast: `loading` while it runs, then its success or error outcome.
 * @param loading - Progress copy of the pressed write.
 * @param write - The write; it resolves to its outcome, or null when the outcome stays in the page (a pending original, a changed viewer) and needs no toast.
 * @returns Once the write settles; mapped failures never reject, unexpected ones still do after their toast.
 */
export async function toastMessagingWrite(loading:string,write:()=>Promise<MessagingConnectionsFeedback|null>):Promise<void>{
  const options:NonNullable<Parameters<typeof toast.promise<MessagingConnectionsFeedback|null>>[1]>={
    loading,
    success:(feedback)=>feedback?.text,
    error:(error)=>error instanceof MessagingConnectionsFeedbackError?error.message:MESSAGING_CONNECTIONS_UI_COPY.unexpected,
  };
  const outcome=write().then((feedback)=>{
    // Sonner reads `success` once the promise resolves: without it, it dismisses the loading toast instead of showing an empty one.
    if(!feedback)options.success=undefined;
    else if(feedback.kind==="alert")throw new MessagingConnectionsFeedbackError(feedback.text);
    return feedback;
  });
  toast.promise(outcome,options);
  try{await outcome;}catch(error){if(!(error instanceof MessagingConnectionsFeedbackError))throw error;}
}

/** @param feedback - Outcome of an explicit read, or null when nothing changed for the person. @returns Nothing after an info or error toast. */
export function toastMessagingRead(feedback:MessagingConnectionsFeedback|null):void{
  if(!feedback)return;
  if(feedback.kind==="alert")toast.error(feedback.text);
  else toast.info(feedback.text);
}
