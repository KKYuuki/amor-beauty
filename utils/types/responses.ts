// Standard action response with strict typing
export interface ActionSuccess<T = void> {
    success: true
    data: T
    message?: string
}

export interface ActionFailure {
    success: false
    error: string
    validationErrors?: Record<string, string[]>
}

export type ActionResponse<T = void> = ActionSuccess<T> | ActionFailure

// Helper functions for consistent responses
export function success<T>(data: T, message?: string): ActionSuccess<T> {
    return message ? { success: true, data, message } : { success: true, data }
}

export function failure(error: string, validationErrors?: Record<string, string[]>): ActionFailure {
    return validationErrors 
        ? { success: false, error, validationErrors }
        : { success: false, error }
}
