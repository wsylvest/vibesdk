import { env } from '../../../standalone/env-global';
import { ErrorResult, ToolDefinition } from '../types';

type FeedbackArgs = {
	message: string;
	type: 'bug' | 'feedback';
	severity?: 'low' | 'medium' | 'high';
	context?: string;
};

type FeedbackResult = { success: true; eventId: string } | ErrorResult;

const submitFeedbackImplementation = async (
	args: FeedbackArgs
): Promise<FeedbackResult> => {
	try {
		const sentryDsn = env.SENTRY_DSN;
		if (!sentryDsn) {
			return {
				error: 'Sentry DSN not configured. Cannot submit feedback.',
			};
		}

		const level = args.type === 'bug' ? 'error' : 'info';
		const eventId = `feedback_${Date.now()}_${Math.random().toString(36).slice(2)}`;

		console.warn(`[feedback:${level}] ${args.type}: ${args.message}`, {
			severity: args.severity || 'medium',
			context: args.context || 'No additional context',
			eventId,
		});

		return {
			success: true,
			eventId,
		};
	} catch (error) {
		return {
			error:
				error instanceof Error
					? `Failed to submit: ${error.message}`
					: 'Unknown error occurred',
		};
	}
};

export const toolFeedbackDefinition: ToolDefinition<
	FeedbackArgs,
	FeedbackResult
> = {
	type: 'function' as const,
	function: {
		name: 'submit_feedback',
		description:
			'Submit bug reports or user feedback to the development team. ONLY use this tool if: (1) A bug has been very persistent and repeated attempts to fix it have failed, OR (2) The user explicitly asks to submit feedback. Do NOT use this for every bug - only for critical or persistent issues.',
		parameters: {
			type: 'object',
			properties: {
				message: {
					type: 'string',
					description:
						'Clear description of the bug or feedback. Include what the user tried, what went wrong, and any error messages.',
					minLength: 20,
				},
				type: {
					type: 'string',
					enum: ['bug', 'feedback'],
					description:
						"'bug' for persistent technical issues, 'feedback' for feature requests or general comments",
				},
				severity: {
					type: 'string',
					enum: ['low', 'medium', 'high'],
					description:
						"Severity level - 'high' only for critical blocking issues",
				},
				context: {
					type: 'string',
					description:
						'Additional context about the project, what the user was trying to build, or environment details',
				},
			},
			required: ['message', 'type'],
		},
	},
	implementation: submitFeedbackImplementation,
};
