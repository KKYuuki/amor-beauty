export type MessageType = 'TEXT' | 'IMAGE' | '3D' | 'AR'
export type MessageReaction = 'NONE' | 'HEART' | 'WOW' | 'LAUGH' | 'SAD' | 'ANGRY' | 'THUMBS_UP'

export interface Message {
    id: string
    created_at: Date
    sender_id: string
    receiver_id: string
    type: MessageType
    reactions: MessageReaction
    content: string
}

export interface CreateMessagePayload {
    sender_id: string
    receiver_id: string
    content: string
}

export interface MessageRead {
    reader_id: string
    sender_id: string
    last_read_message_id: string
    read_at: Date
}

export interface CreateMessageReadPayload {
    reader_id: string
    sender_id: string
    last_read_message_id: string
}

export interface Chat {
    full_name: string
    avatar_url: string
    id: string
    last_message: string
    created_at: Date
}

export type ChatList = Array<Chat>

export interface AvaialbleUser {
    id: string
    full_name: string
    avatar_url: string
}

// Define the structure of the data you track for each user's presence.
// This matches the object passed to chatChannel.track({...})
export interface TrackedPresenceState {
    user_id: string;
    isActive: boolean;
    isTyping: boolean;
}

// Define the structure of the object returned by chatChannel.presenceState().
// It is a Record where the keys are the user IDs, and the values are arrays
// containing the TrackedPresenceState objects for that user.
export interface SupabasePresenceState {
    [userId: string]: TrackedPresenceState[];
}