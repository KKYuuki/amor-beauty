export type NotificationType = 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING'

export interface NotificationItem {
    id: string
    title?: string
    message: string
    type: NotificationType
}

export interface NotificationContextType {
    notifications: NotificationItem[]
    addNotification: (message: string, type?: NotificationType, title?: string, ephemeral?: boolean) => void
    removeNotification: (id: string) => void
    clearAll: () => void
}