import { onRunCompleted } from "../run/completion.js";
import { handleFeedbackRunCompleted } from "./eval-queue.js";
import { handleProposalReviewRunCompleted } from "./review-queue.js";

onRunCompleted(handleFeedbackRunCompleted);
onRunCompleted(handleProposalReviewRunCompleted);
