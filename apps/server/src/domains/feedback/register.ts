import { onRunCompleted } from "../run/completion.js";
import { handleFeedbackRunCompleted } from "./eval-queue.js";

onRunCompleted(handleFeedbackRunCompleted);
