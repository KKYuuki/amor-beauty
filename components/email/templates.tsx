import {
    Body,
    Button,
    Container,
    Heading,
    Hr,
    Html,
    Img,
    Link,
    Section,
    Tailwind,
    Text,
    Preview,
    Head,
} from "@react-email/components"

const logo = "https://amorbeautylounge.com/icon.png"

export function BaseEmailTemplate({
    subject,
    preview,
    children,
}: {
    subject: string
    preview?: string
    children?: React.ReactNode
}) {
    return (
        <Html>
            <Head />
            <Tailwind>
                <Body className='bg-black text-white font-sans'>
                    <Preview>{preview ? preview : subject}</Preview>
                    <Container className='mx-auto my-0 max-w-[600px] px-0 pt-5 pb-12'>
                        <Img
                            src={logo}
                            alt='Amor Beauty Lounge'
                            className='h-auto w-20'
                        />
                        <Heading className='font-serif text-[24px] tracking-[-0.5px] leading-[1.3] pt-[17px] px-0 pb-0'>
                            {subject}
                        </Heading>
                        {children}
                        <Hr className='border-white/20 mt-[42px] mb-[26px]' />
                        <Link
                            href='https://amorbeautylounge.com'
                            className='text-white/60 text-[14px]'
                        >
                            Amor Beauty Lounge
                        </Link>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    )
}

export function PasswordResetTemplate({ link }: { link: string }) {
    return (
        <BaseEmailTemplate
            subject='Password Reset'
            preview='This link is only valid until the next day. Please use the link before the day ends.'
        >
            <Section className='py-[27px] px-0'>
                <Button
                    className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[4px] px-[23px]'
                    href={link}
                >
                    Reset Password
                </Button>
            </Section>
            <Text className='mb-[15px] mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Please use this link before <b>midnight (0:00 PST) tonight</b>,
                as it will expire at the start of the next calendar day. If you
                miss this window, please generate a new password reset request
                or contact our support directly on the site.
            </Text>
        </BaseEmailTemplate>
    )
}

export function SendInvitationTemplate({
    link,
    email,
}: {
    link: string
    email: string
}) {
    return (
        <BaseEmailTemplate
            subject='You have been invited to Amor Beauty Lounge!'
            preview='This link is only valid until the next day. Please use the link before the day ends.'
        >
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Hello <b>{email}</b>, you have been invited to Amor Beauty Lounge.
            </Text>
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Please click the button below to accept your invitation or copy
                the link below and paste it into your browser.
            </Text>
            <Section className='py-[27px] px-0'>
                <Button
                    className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[4px] px-[23px]'
                    href={link}
                >
                    Accept Invitation
                </Button>
            </Section>
            <Link
                href={link}
                className='font-mono font-bold px-1 py-px bg-white/10 text-white/60 text-[13px] tracking-[-0.3px] rounded-sm w-full mb-[15px] block break-all'
            >
                {link}
            </Link>
            <Text className='mb-[15px] mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Please use this link before <b>midnight (0:00 PST) tonight</b>,
                as it will expire at the start of the next calendar day.
            </Text>
        </BaseEmailTemplate>
    )
}

export function AppointmentCreatedTemplate({
    clientName,
    appointmentDate,
    appointmentTime,
    serviceName,
    link,
}: {
    clientName: string
    appointmentDate: string
    appointmentTime: string
    serviceName: string
    link: string
}) {
    return (
        <BaseEmailTemplate
            subject='Appointment Scheduled'
            preview={`Your appointment for ${serviceName} has been scheduled.`}
        >
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Hello <b>{clientName}</b>,
            </Text>
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Your appointment for <b>{serviceName}</b> has been successfully
                scheduled.
            </Text>
            <Section className='bg-white/5 border border-white/10 rounded-lg p-4 my-4'>
                <Text className='m-0 text-white/80 text-sm font-semibold uppercase tracking-wider'>
                    Date
                </Text>
                <Text className='m-0 text-white text-lg font-bold mb-4'>
                    {appointmentDate}
                </Text>
                <Text className='m-0 text-white/80 text-sm font-semibold uppercase tracking-wider'>
                    Time
                </Text>
                <Text className='m-0 text-white text-lg font-bold'>
                    {appointmentTime}
                </Text>
            </Section>
            <Section className='py-[10px] px-0'>
                <Button
                    className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[8px] px-[23px]'
                    href={link}
                >
                    View Appointment
                </Button>
            </Section>
        </BaseEmailTemplate>
    )
}

export function AppointmentStatusTemplate({
    clientName,
    appointmentDate,
    status,
    reason,
    link,
}: {
    clientName: string
    appointmentDate: string
    status: "ACCEPTED" | "REJECTED"
    reason?: string
    link: string
}) {
    const isAccepted = status === "ACCEPTED"
    const subject = isAccepted ? "Appointment Confirmed" : "Appointment Update"
    const colorClass = isAccepted ? "text-green-400" : "text-red-400"

    return (
        <BaseEmailTemplate
            subject={subject}
            preview={`Your appointment on ${appointmentDate} has been ${status.toLowerCase()}.`}
        >
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Hello <b>{clientName}</b>,
            </Text>
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Your appointment scheduled for <b>{appointmentDate}</b> has been{" "}
                <span className={`font-bold ${colorClass}`}>{status}</span>.
            </Text>
            {!isAccepted && reason && (
                <Section className='bg-red-500/10 border border-red-500/20 rounded-lg p-4 my-4'>
                    <Text className='m-0 text-red-200 text-sm font-bold uppercase tracking-wider mb-1'>
                        Reason
                    </Text>
                    <Text className='m-0 text-white text-[15px]'>{reason}</Text>
                </Section>
            )}
            <Section className='py-[10px] px-0'>
                <Button
                    className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[8px] px-[23px]'
                    href={link}
                >
                    View Details
                </Button>
            </Section>
        </BaseEmailTemplate>
    )
}

export function AppointmentReminderTemplate({
    clientName,
    appointmentDate,
    appointmentTime,
    serviceName,
    link,
}: {
    clientName: string
    appointmentDate: string
    appointmentTime: string
    serviceName: string
    link: string
}) {
    return (
        <BaseEmailTemplate
            subject='Appointment Reminder'
            preview={`Reminder: You have an appointment tomorrow for ${serviceName}.`}
        >
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                Hello <b>{clientName}</b>,
            </Text>
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                This is a reminder for your upcoming appointment for{" "}
                <b>{serviceName}</b>.
            </Text>
            <Section className='bg-white/5 border border-white/10 rounded-lg p-4 my-4'>
                <Text className='m-0 text-white/80 text-sm font-semibold uppercase tracking-wider'>
                    When
                </Text>
                <Text className='m-0 text-white text-lg font-bold'>
                    {appointmentDate} at {appointmentTime}
                </Text>
            </Section>
            <Section className='py-[10px] px-0'>
                <Button
                    className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[8px] px-[23px]'
                    href={link}
                >
                    View Appointment
                </Button>
            </Section>
        </BaseEmailTemplate>
    )
}

export function InventoryLowTemplate({
    itemName,
    currentStock,
    threshold,
    link,
}: {
    itemName: string
    currentStock: number
    threshold: number
    link: string
}) {
    return (
        <BaseEmailTemplate
            subject={`Low Stock Alert: ${itemName}`}
            preview={`${itemName} is running low. Current stock: ${currentStock}.`}
        >
            <Heading className='text-white text-xl font-bold mb-4'>
                Low Stock Warning
            </Heading>
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                The inventory item <b>{itemName}</b> has fallen below the
                warning threshold.
            </Text>
            <Section className='bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 my-4 grid grid-cols-2 gap-4'>
                <div>
                    <Text className='m-0 text-orange-200 text-xs font-bold uppercase tracking-wider'>
                        Current Stock
                    </Text>
                    <Text className='m-0 text-white text-xl font-bold'>
                        {currentStock}
                    </Text>
                </div>
                <div>
                    <Text className='m-0 text-orange-200 text-xs font-bold uppercase tracking-wider'>
                        Threshold
                    </Text>
                    <Text className='m-0 text-white text-xl font-bold'>
                        {threshold}
                    </Text>
                </div>
            </Section>
            <Section className='py-[10px] px-0'>
                <Button
                    className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[8px] px-[23px]'
                    href={link}
                >
                    Manage Inventory
                </Button>
            </Section>
        </BaseEmailTemplate>
    )
}

export function InventoryRestockRequestTemplate({
    requesterName,
    itemName,
    quantity,
    link,
}: {
    requesterName: string
    itemName: string
    quantity: number
    link: string
}) {
    return (
        <BaseEmailTemplate
            subject='Inventory Restock Request'
            preview={`${requesterName} requested a restock for ${itemName}.`}
        >
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white'>
                <b>{requesterName}</b> has requested a restock.
            </Text>
            <Section className='bg-white/5 border border-white/10 rounded-lg p-4 my-4'>
                <Text className='m-0 text-white/80 text-sm font-semibold uppercase tracking-wider'>
                    Item
                </Text>
                <Text className='m-0 text-white text-lg font-bold mb-2'>
                    {itemName}
                </Text>
                <Text className='m-0 text-white/80 text-sm font-semibold uppercase tracking-wider'>
                    Requested Quantity
                </Text>
                <Text className='m-0 text-white text-lg font-bold'>
                    {quantity}
                </Text>
            </Section>
            <Section className='py-[10px] px-0'>
                <Button
                    className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[8px] px-[23px]'
                    href={link}
                >
                    View Request
                </Button>
            </Section>
        </BaseEmailTemplate>
    )
}

export function GenericMessageTemplate({
    title,
    message,
    link,
    buttonText = "View Details",
}: {
    title: string
    message: string
    link?: string
    buttonText?: string
}) {
    return (
        <BaseEmailTemplate
            subject={title}
            preview={message.substring(0, 100)}
        >
            <Heading className='text-white text-xl font-bold mb-4'>
                {title}
            </Heading>
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white whitespace-pre-wrap'>
                {message}
            </Text>
            {link && (
                <Section className='py-[20px] px-0'>
                    <Button
                        className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[8px] px-[23px]'
                        href={link}
                    >
                        {buttonText}
                    </Button>
                </Section>
            )}
        </BaseEmailTemplate>
    )
}

export function NotificationTemplate({
    title,
    content,
    link,
}: {
    title: string
    content: string
    link?: string
}) {
    return (
        <BaseEmailTemplate
            subject={title}
            preview={content.substring(0, 100)}
        >
            <Text className='mx-0 mt-0 leading-[1.4] text-[15px] text-white font-semibold mb-2'>
                New Notification
            </Text>
            <Section className='bg-white/5 border border-white/10 rounded-lg p-4 mb-4'>
                <Heading className='text-white text-lg font-bold m-0 mb-2'>
                    {title}
                </Heading>
                <Text className='m-0 text-white/80 text-[15px] leading-[1.4]'>
                    {content}
                </Text>
            </Section>
            {link && (
                <Section className='py-[10px] px-0'>
                    <Button
                        className='bg-white/5 border-2 border-white/10 rounded font-semibold text-white text-[15px] no-underline text-center block py-[8px] px-[23px]'
                        href={link}
                    >
                        View Notification
                    </Button>
                </Section>
            )}
        </BaseEmailTemplate>
    )
}
