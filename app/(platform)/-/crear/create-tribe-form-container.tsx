"use client";

import {
  CreateTribeForm,
  type CreateTribeFormProps,
} from "@/components/tribes/create-tribe-form";
import { navigateToUrl } from "@/lib/browser-navigation";
import { submitCreateTribeRequest } from "@/lib/tribes/create-tribe-api-client";
import {
  CREATE_TRIBE_FORM_SUBMIT_STATUS,
  resolveCreateTribeErrorField,
  type CreateTribeFormSubmitOutcome,
  type CreateTribeFormValues,
} from "@/lib/tribes/create-tribe-form-feedback";
import {
  CREATE_TRIBE_ERROR_CODE,
  CREATE_TRIBE_ERROR_MESSAGE,
  CREATE_TRIBE_STATUS,
} from "@/src/modules/tribes/application/results/create-tribe-result";

type CreateTribeFormContainerProps = Omit<
  CreateTribeFormProps,
  "onSubmitTribe"
>;

const UNEXPECTED_SUBMIT_OUTCOME = {
  field: null,
  message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_ERROR_CODE.unexpected],
  status: CREATE_TRIBE_FORM_SUBMIT_STATUS.failed,
  suggestedSlug: null,
} as const satisfies CreateTribeFormSubmitOutcome;

/**
 * Client container of the create-tribe form: progressively enhances the
 * native form post with a JSON submission. Success (and an expired session)
 * navigates to the URL the redirect flow would have used; validation errors
 * and slug conflicts return to the form as inline feedback. A network failure
 * or an unreadable response becomes the safe unexpected-failure copy.
 */
export function CreateTribeFormContainer(props: CreateTribeFormContainerProps) {
  const { submitPath } = props;

  const submitTribe = async (
    values: CreateTribeFormValues
  ): Promise<CreateTribeFormSubmitOutcome> => {
    const result = await submitCreateTribeRequest({ ...values, submitPath });

    if (!result.isSuccess) {
      return UNEXPECTED_SUBMIT_OUTCOME;
    }

    const { response } = result;

    switch (response.status) {
      case CREATE_TRIBE_STATUS.created:
      case CREATE_TRIBE_ERROR_CODE.unauthenticated:
        // A full navigation: the new tribe (or sign-in) page loads its own
        // server data, like the native redirect flow.
        navigateToUrl(response.redirectUrl);

        return { status: CREATE_TRIBE_FORM_SUBMIT_STATUS.navigating };
      case CREATE_TRIBE_STATUS.slugConflict:
        return {
          field: resolveCreateTribeErrorField(response.status),
          message: response.message,
          status: CREATE_TRIBE_FORM_SUBMIT_STATUS.failed,
          suggestedSlug: response.suggestedSlug,
        };
      default:
        return {
          field: resolveCreateTribeErrorField(response.status),
          message: response.message,
          status: CREATE_TRIBE_FORM_SUBMIT_STATUS.failed,
          suggestedSlug: null,
        };
    }
  };

  return <CreateTribeForm {...props} onSubmitTribe={submitTribe} />;
}
