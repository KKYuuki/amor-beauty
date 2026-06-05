import { Metadata } from "next"
import CalendarClientPage from "./calendarPage"

export const metadata: Metadata = {
    title: "Calendar",
    description: "View your calendar",
}

export default function CalendarPage() {
    return (
        <div className='w-full h-full flex flex-col gap-2 relative'>
            <CalendarClientPage />
        </div>
    )
}
