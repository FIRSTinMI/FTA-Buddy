import { existsSync, mkdirSync } from 'fs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportFormat {
    title: string;
    description: string;
    headers: string[];
    fileName: string;
}

export async function generateReport(
    format: ReportFormat,
    data: (string | number)[][],
    eventCode: string
) {
    const doc = new jsPDF({
        format: 'letter'
    });

    // Title and description
    doc.setFontSize(20);
    doc.text(format.title, 15, 20);
    doc.setFontSize(12);
    doc.text(format.description, 15, 30);

    // Sanitize data by removing "www.", "http://", and "https://"
    const sanitizedData = data.map(row =>
        row.map(cell => {
            if (typeof cell === 'string') {
                let sanitized = cell;
                try {
                    const url = new URL(sanitized);
                    // Remove www. from the hostname
                    let host = url.hostname.replace(/^www\./, '');
                    // Remove http:// or https:// from the beginning
                    sanitized = host + url.pathname + url.search + url.hash;
                } catch {
                    // Not a valid URL — fallback to regex check
                    sanitized = sanitized.replace(/^https?:\/\//, '');
                    sanitized = sanitized.replace(/^www\./, '');
                }
                return sanitized;
            }
            return cell;
        })
    );

    // Table headers
    autoTable(doc, {
        head: [format.headers],
        body: sanitizedData,
        startY: 40,
        margin: { top: 10, bottom: 20 }
    });

    const date = new Date();
    const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    doc.setFontSize(10);
    doc.setTextColor('#666666');
    const pageCount = doc.internal.pages.length;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.text(`${eventCode}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 12, { align: 'center' });
        doc.text(`Generated by FTA Buddy`, doc.internal.pageSize.width - 10, doc.internal.pageSize.height - 15, { align: 'right' });
        doc.text(formattedDate, doc.internal.pageSize.width - 10, doc.internal.pageSize.height - 10, { align: 'right' });
    }

    if (!existsSync('reports')) {
        mkdirSync('reports');
    }

    // Save the PDF file
    await doc.save(`reports/${format.fileName}-${eventCode}.pdf`);
    return `/report/${format.fileName}-${eventCode}.pdf`;
}