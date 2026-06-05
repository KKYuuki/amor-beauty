import { PDFDocument, StandardFonts } from 'pdf-lib'

export interface ReceiptData {
    transactionNumber: string
    date: string
    items: Array<{
        name: string
        quantity: number
        unitPrice: number
        lineTotal: number
    }>
    subtotal: number
    tax: number
    discount: number
    total: number
    amountPaid: number
    changeGiven?: number
    paymentMethod: string
    branchName?: string
    staffName?: string
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([300, 600])
    const font = await pdfDoc.embedFont(StandardFonts.Courier)

    let y = 580

    // Header
    page.drawText(data.branchName || 'AMOR BEAUTY LOUNGE', { x: 20, y, size: 14, font })
    y -= 20
    page.drawText('================================', { x: 20, y, size: 10, font })
    y -= 15

    // Transaction info
    page.drawText(`TXN: ${data.transactionNumber}`, { x: 20, y, size: 10, font })
    y -= 12
    page.drawText(`Date: ${data.date}`, { x: 20, y, size: 10, font })
    if (data.staffName) {
        y -= 12
        page.drawText(`Staff: ${data.staffName}`, { x: 20, y, size: 10, font })
    }
    y -= 15

    // Items
    page.drawText('--------------------------------', { x: 20, y, size: 10, font })
    y -= 12

    for (const item of data.items) {
        page.drawText(`${item.name.slice(0, 20).padEnd(20)}`, { x: 20, y, size: 9, font })
        y -= 12
        page.drawText(`  ${item.quantity} x ${item.unitPrice.toFixed(2)} = ${item.lineTotal.toFixed(2)}`, { x: 20, y, size: 9, font })
        y -= 12
    }

    // Totals
    y -= 5
    page.drawText('--------------------------------', { x: 20, y, size: 10, font })
    y -= 12
    page.drawText(`Subtotal: ${data.subtotal.toFixed(2)}`, { x: 20, y, size: 10, font })
    y -= 12
    if (data.discount > 0) {
        page.drawText(`Discount: -${data.discount.toFixed(2)}`, { x: 20, y, size: 10, font })
        y -= 12
    }
    page.drawText(`Tax: ${data.tax.toFixed(2)}`, { x: 20, y, size: 10, font })
    y -= 12
    page.drawText(`TOTAL: ${data.total.toFixed(2)}`, { x: 20, y, size: 12, font })
    y -= 15
    page.drawText(`Paid: ${data.amountPaid.toFixed(2)} (${data.paymentMethod})`, { x: 20, y, size: 10, font })
    if (data.changeGiven) {
        y -= 12
        page.drawText(`Change: ${data.changeGiven.toFixed(2)}`, { x: 20, y, size: 10, font })
    }

    // Footer
    y -= 20
    page.drawText('================================', { x: 20, y, size: 10, font })
    y -= 12
    page.drawText('Thank you!', { x: 80, y, size: 10, font })

    return pdfDoc.save()
}
