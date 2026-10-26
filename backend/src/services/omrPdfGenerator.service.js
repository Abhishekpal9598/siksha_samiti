import PDFDocument from 'pdfkit';
import { createOmrTokenPayload, generateOmrQrBuffer } from './omrToken.service.js';

/**
 * Canonical OMR A4 Layout Geometry Specifications
 * Standard A4 Page: 210mm x 297mm (595.28 x 841.89 pt at 72 pt/inch)
 */
export const OMR_LAYOUT_SPEC = {
  version: 'LAYOUT_A4_V1',
  page: {
    size: 'A4',
    orientation: 'portrait',
    width: 595.28,
    height: 841.89
  },
  fiducials: {
    size: 26,
    offset: 25,
    topLeft: { x: 25, y: 25 },
    topRight: { x: 544.28, y: 25 },
    bottomLeft: { x: 25, y: 790.89 },
    bottomRight: { x: 544.28, y: 790.89 }
  },
  bubble: {
    radius: 5.5,
    diameter: 11,
    optionSpacing: 16,
    options: ['A', 'B', 'C', 'D']
  },
  columns: {
    twoColumn: [
      { startQ: 1, endQ: 25, xOffset: 90 },
      { startQ: 26, endQ: 50, xOffset: 350 }
    ],
    fourColumn: [
      { startQ: 1, endQ: 25, xOffset: 65 },
      { startQ: 26, endQ: 50, xOffset: 195 },
      { startQ: 51, endQ: 75, xOffset: 325 },
      { startQ: 76, endQ: 100, xOffset: 455 }
    ]
  }
};

/**
 * Draw 4 corner fiducial markers for OpenCV homography alignment
 */
function drawCornerFiducials(doc) {
  const { size, topLeft, topRight, bottomLeft, bottomRight } = OMR_LAYOUT_SPEC.fiducials;
  doc.save();
  doc.fillColor('#000000');

  // Top-Left
  doc.rect(topLeft.x, topLeft.y, size, size).fill();
  // Top-Right
  doc.rect(topRight.x, topRight.y, size, size).fill();
  // Bottom-Left
  doc.rect(bottomLeft.x, bottomLeft.y, size, size).fill();
  // Bottom-Right
  doc.rect(bottomRight.x, bottomRight.y, size, size).fill();

  doc.restore();
}

/**
 * Draw Question Bubble Grid
 */
function drawBubbleGrid(doc, totalQuestions, startY = 220) {
  const isFourCol = totalQuestions > 50;
  const colLayout = isFourCol ? OMR_LAYOUT_SPEC.columns.fourColumn : OMR_LAYOUT_SPEC.columns.twoColumn;
  const questionsPerCol = 25;
  const rowHeight = 19;
  const { radius, optionSpacing, options } = OMR_LAYOUT_SPEC.bubble;

  doc.save();

  colLayout.forEach((col) => {
    // Column Header
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#333333');
    doc.text('Q#', col.xOffset, startY - 14, { width: 18, align: 'right' });
    
    options.forEach((opt, idx) => {
      const optX = col.xOffset + 26 + idx * optionSpacing;
      doc.text(opt, optX - 4, startY - 14, { width: 8, align: 'center' });
    });

    // Column Divider Line above rows
    doc.strokeColor('#999999').lineWidth(0.5);
    doc.moveTo(col.xOffset, startY - 4)
       .lineTo(col.xOffset + 26 + 3 * optionSpacing + 10, startY - 4)
       .stroke();

    // Question Rows
    for (let q = col.startQ; q <= Math.min(col.endQ, totalQuestions); q++) {
      const rowIdx = (q - 1) % questionsPerCol;
      const currentY = startY + rowIdx * rowHeight;

      // Question Number
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000');
      doc.text(`${q}.`, col.xOffset, currentY - 4, { width: 18, align: 'right' });

      // Option Bubbles A, B, C, D
      options.forEach((opt, idx) => {
        const bubbleCenterX = col.xOffset + 26 + idx * optionSpacing;
        const bubbleCenterY = currentY;

        // Outer circular stroke
        doc.lineWidth(0.8).strokeColor('#000000');
        doc.circle(bubbleCenterX, bubbleCenterY, radius).stroke();

        // Option letter label inside circle
        doc.fontSize(5.5).font('Helvetica').fillColor('#444444');
        doc.text(opt, bubbleCenterX - 3, bubbleCenterY - 3.5, { width: 6, align: 'center' });
      });
    }
  });

  doc.restore();
}

/**
 * Draw Candidate & Invigilator Signature Footer
 */
function drawFooterBoxes(doc, startY = 735) {
  doc.save();
  doc.lineWidth(0.8).strokeColor('#000000');

  // Candidate Signature Box
  doc.rect(60, startY, 210, 38).stroke();
  doc.fontSize(7).font('Helvetica').fillColor('#444444');
  doc.text('Candidate Signature (अभ्यर्थी के हस्ताक्षर)', 65, startY + 26, { width: 200, align: 'center' });

  // Invigilator Signature Box
  doc.rect(325, startY, 210, 38).stroke();
  doc.text('Invigilator Signature (निरीक्षक के हस्ताक्षर)', 330, startY + 26, { width: 200, align: 'center' });

  // System Watermark & Version
  doc.fontSize(6).font('Helvetica').fillColor('#666666');
  doc.text(
    `Official Examination OMR Answer Sheet • Education Committee Portal • ${OMR_LAYOUT_SPEC.version} • Do not fold, tear or soil`,
    50,
    startY + 44,
    { width: 495, align: 'center' }
  );

  doc.restore();
}

/**
 * Generate Printable Generic OMR Answer Sheet PDF
 * 
 * @param {Object} params
 * @param {Object} params.competition - Competition document
 * @param {number} [params.totalQuestions=50] - Number of questions
 * @returns {Promise<Buffer>} PDF binary buffer
 */
export async function generateGenericOmrPdf({ competition, totalQuestions = 50 }) {
  return new Promise((resolve, reject) => {
    try {
      const qCount = Math.min(Math.max(Number(totalQuestions) || 50, 1), 100);
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 0,
        info: {
          Title: `OMR_Generic_${competition.title}`,
          Author: 'Education Committee Competition Management System',
          Subject: 'OMR Answer Sheet (Generic)'
        }
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // 1. Draw Corner Fiducials
      drawCornerFiducials(doc);

      // 2. Header & Title Block
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
      doc.text(competition.titleEn || competition.title || 'COMPETITION EXAMINATION', 60, 48, {
        width: 475,
        align: 'center'
      });

      doc.font('Helvetica').fontSize(8.5).fillColor('#333333');
      doc.text(
        `Category: ${competition.category || 'General'}  |  Duration: ${competition.durationMinutes || 60} Mins  |  Total Marks: ${competition.totalMarks || 100}  |  Layout: ${OMR_LAYOUT_SPEC.version}`,
        60,
        65,
        { width: 475, align: 'center' }
      );

      // Divider line
      doc.strokeColor('#000000').lineWidth(1).moveTo(60, 78).lineTo(535, 78).stroke();

      // 3. Roll Number 6-Digit Grid & Candidate Details (Left Side: X 60 to 280)
      doc.lineWidth(0.8).strokeColor('#000000');
      doc.rect(60, 85, 230, 118).stroke();

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000');
      doc.text('ROLL NUMBER / अनुक्रमांक', 65, 90, { width: 220, align: 'center' });

      // 6 Digit boxes on top
      const digitColWidth = 18;
      const startGridX = 115;
      for (let d = 0; d < 6; d++) {
        const boxX = startGridX + d * digitColWidth;
        doc.rect(boxX, 100, 16, 14).stroke();
      }

      // Digits 0..9 Bubble Matrix
      for (let r = 0; r <= 9; r++) {
        const rowY = 120 + r * 7.5;
        for (let d = 0; d < 6; d++) {
          const bubbleX = startGridX + d * digitColWidth + 8;
          doc.circle(bubbleX, rowY, 3.2).stroke();
          doc.fontSize(4.5).font('Helvetica').fillColor('#555555');
          doc.text(r.toString(), bubbleX - 2, rowY - 2.5, { width: 4, align: 'center' });
        }
      }

      // 4. Instructions & Filling Guide (Right Side: X 305 to 535)
      doc.rect(305, 85, 230, 118).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000');
      doc.text('INSTRUCTIONS / महत्वपूर्ण निर्देश', 310, 90, { width: 220, align: 'center' });

      doc.font('Helvetica').fontSize(6.5).fillColor('#222222');
      const instructions = [
        '1. Use only Black / Blue ballpoint pen to darken circles.',
        '2. Darken completely: [ ● ] Correct  |  [ X ] [ / ] [ . ] Wrong.',
        '3. Fill only ONE option per question. Multiple marks will be rejected.',
        '4. Do not fold, tear, wrinkle or make stray marks on this sheet.',
        '5. Ensure all four black corner alignment squares remain intact.'
      ];
      instructions.forEach((inst, i) => {
        doc.text(inst, 312, 104 + i * 14.5, { width: 216 });
      });

      // 5. Question Bubble Grid
      drawBubbleGrid(doc, qCount, 222);

      // 6. Signatures & Footer
      drawFooterBoxes(doc, 735);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate Printable Personalized OMR Answer Sheet PDF with Secure QR Code
 * 
 * @param {Object} params
 * @param {Object} params.competition - Competition document
 * @param {Object} params.registration - Registration document
 * @param {Object} params.student - User document
 * @param {number} [params.totalQuestions=50] - Number of questions
 * @returns {Promise<Buffer>} PDF binary buffer
 */
export async function generatePersonalizedOmrPdf({ competition, registration, student, totalQuestions = 50 }) {
  return new Promise(async (resolve, reject) => {
    try {
      const qCount = Math.min(Math.max(Number(totalQuestions) || 50, 1), 100);

      // Generate or retrieve registration OMR token
      if (!registration.omrSheetToken) {
        registration.omrSheetToken = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        await registration.save();
      }

      // Generate Secure QR Token Payload (Zero Student PII)
      const qrPayload = createOmrTokenPayload({
        competitionId: competition._id,
        registrationId: registration._id,
        omrSheetToken: registration.omrSheetToken
      });

      const qrPngBuffer = await generateOmrQrBuffer(qrPayload);

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 0,
        info: {
          Title: `OMR_${registration.rollNumber}_${competition.title}`,
          Author: 'Education Committee Competition Management System',
          Subject: 'Personalized OMR Answer Sheet'
        }
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // 1. Draw Corner Fiducials
      drawCornerFiducials(doc);

      // 2. Header & Title Block
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
      doc.text(competition.titleEn || competition.title || 'COMPETITION EXAMINATION', 60, 48, {
        width: 475,
        align: 'center'
      });

      doc.font('Helvetica').fontSize(8.5).fillColor('#333333');
      doc.text(
        `Category: ${competition.category || 'General'}  |  Duration: ${competition.durationMinutes || 60} Mins  |  Total Marks: ${competition.totalMarks || 100}  |  Official Sheet`,
        60,
        65,
        { width: 475, align: 'center' }
      );

      // Divider line
      doc.strokeColor('#000000').lineWidth(1).moveTo(60, 78).lineTo(535, 78).stroke();

      // 3. Pre-Filled Candidate Details Box (Left Side: X 60 to 395)
      doc.lineWidth(0.8).strokeColor('#000000');
      doc.rect(60, 85, 335, 118).stroke();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
      doc.text('CANDIDATE INFORMATION / अभ्यर्थी का विवरण', 65, 90, { width: 325, align: 'center' });

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#222222');
      doc.text('Roll Number (अनुक्रमांक):', 70, 108);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
      doc.text(registration.rollNumber || 'N/A', 190, 107);

      doc.font('Helvetica').fontSize(7.5).fillColor('#222222');
      doc.text('Candidate Name (नाम):', 70, 126);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
      doc.text(student.fullName || 'N/A', 190, 126);

      doc.font('Helvetica').fontSize(7.5).fillColor('#222222');
      doc.text('Class / Grade (कक्षा):', 70, 144);
      doc.font('Helvetica').fontSize(8).fillColor('#000000');
      doc.text(student.classOrGrade || 'N/A', 190, 144);

      doc.font('Helvetica').fontSize(7.5).fillColor('#222222');
      doc.text('School / Center (विद्यालय):', 70, 162);
      doc.font('Helvetica').fontSize(8).fillColor('#000000');
      doc.text(student.school || 'Designated Exam Center', 190, 162, { width: 200 });

      doc.fontSize(6).font('Helvetica-Oblique').fillColor('#666666');
      doc.text('Personalized Sheet: Pre-registered with secure machine verification.', 70, 185);

      // 4. Secure QR Code Box (Right Side: X 410 to 535)
      doc.rect(410, 85, 125, 118).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
      doc.text('SECURE QR CODE', 415, 90, { width: 115, align: 'center' });

      // Embed QR Code PNG
      doc.image(qrPngBuffer, 432, 102, { width: 80, height: 80 });

      doc.font('Helvetica').fontSize(5.5).fillColor('#555555');
      doc.text('HMAC Encrypted ID\nDo not smudge', 415, 186, { width: 115, align: 'center' });

      // 5. Question Bubble Grid
      drawBubbleGrid(doc, qCount, 222);

      // 6. Signatures & Footer
      drawFooterBoxes(doc, 735);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
