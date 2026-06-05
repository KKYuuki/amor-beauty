/**
 * Server-only PDF Export Utilities
 * These functions use Node.js fs module and must only run on the server
 */
import "server-only";

import fs from 'fs'
import path from 'path'
import { ExportRow, InventoryExportRow } from './export-utils'

// --- Helper Functions ---

function addHeader(doc: InstanceType<typeof import('jspdf').jsPDF>, title: string, yPos: number, dateRange?: string): number {
    let currentY = yPos

    try {
        const logoPath = path.join(process.cwd(), 'public', 'logo.png')
        if (fs.existsSync(logoPath)) {
            const logoData = fs.readFileSync(logoPath)
            const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`
            doc.addImage(logoBase64, 'PNG', 14, currentY, 22, 22)
            currentY += 28
        }
    } catch {
        // Logo loading failed, continue without it
    }

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, currentY)
    currentY += 7

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, currentY)
    currentY += 5

    if (dateRange) {
        doc.text(`Period: ${dateRange}`, 14, currentY)
        currentY += 5
    }

    return currentY
}

// --- Main Functions ---

/**
 * Generate PDF document buffer from export rows
 * Returns a base64 encoded string
 */
export async function generatePDF(rows: ExportRow[], title: string = 'Transaction Report'): Promise<string> {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    let yPos = 15

    yPos = addHeader(doc, title, yPos)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Total Transactions: ${rows.length}`, 14, yPos)
    yPos += 5

    const totalRevenue = rows.reduce((sum, row) => sum + row.total, 0)
    doc.text(`Total Revenue: ${totalRevenue.toFixed(2)}`, 14, yPos)
    yPos += 6

    const tableHeaders = [
        'Transaction #',
        'Date',
        'Time',
        'Staff',
        'Customer',
        'Items',
        'Total',
        'Payment',
        'Status',
    ]

    const tableData = rows.map(row => [
        row.transaction_number,
        row.date,
        row.time,
        row.staff,
        row.customer,
        String(row.items_count),
        row.total.toFixed(2),
        row.payment_method,
        row.status,
    ])

    autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: yPos,
        styles: {
            fontSize: 8,
            cellPadding: 2,
        },
        headStyles: {
            fillColor: [66, 66, 66],
            textColor: 255,
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245],
        },
        columnStyles: {
            0: { cellWidth: 35 },
            6: { halign: 'right' },
        },
    })

    const pdfOutput = doc.output('arraybuffer')
    return Buffer.from(pdfOutput).toString('base64')
}

/**
 * Generate PDF document buffer from inventory rows
 */
export async function generateInventoryPDF(rows: InventoryExportRow[], title: string = 'Inventory Report'): Promise<string> {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const fs = await import('fs')
    const path = await import('path')

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    let yPos = 15

    // Try to add logo with proper margins
    try {
        const logoPath = path.join(process.cwd(), 'public', 'logo.png')
        if (fs.existsSync(logoPath)) {
            const logoData = fs.readFileSync(logoPath)
            const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`
            // Add logo with margins: x=20, y=yPos, width=22, height=22
            doc.addImage(logoBase64, 'PNG', 20, yPos, 22, 22)
            yPos += 28  // Proper spacing after logo
        }
    } catch {
        // Logo loading failed, continue without it
    }

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, yPos)
    yPos += 7

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos)
    yPos += 5
    doc.text(`Total Items: ${rows.length}`, 14, yPos)
    yPos += 5

    const totalValuation = rows.reduce((sum, row) => sum + row.valuation, 0)
    doc.text(`Total Valuation: ${totalValuation.toFixed(2)}`, 14, yPos)
    yPos += 6

    const tableHeaders = [
        'Name',
        'Code',
        'Category',
        'Stock',
        'Low',
        'Cost',
        'Sell',
        'Value',
        'Last Restocked'
    ]

    const tableData = rows.map(row => [
        row.name,
        row.code,
        row.category,
        String(row.stock),
        row.is_low_stock,
        row.unit_price.toFixed(2),
        row.selling_price.toFixed(2),
        row.valuation.toFixed(2),
        row.last_restocked
    ])

    autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: yPos,
        styles: {
            fontSize: 8,
            cellPadding: 2,
        },
        headStyles: {
            fillColor: [66, 66, 66],
            textColor: 255,
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245],
        },
    })

    const pdfOutput = doc.output('arraybuffer')
    return Buffer.from(pdfOutput).toString('base64')
}
