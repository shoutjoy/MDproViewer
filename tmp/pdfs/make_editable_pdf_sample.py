from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


output = Path(__file__).with_name("editable-pdf-sample.pdf")
pdf = canvas.Canvas(str(output), pagesize=A4)
pdf.setTitle("Editable PDF Import Test")
pdf.setFont("Helvetica-Bold", 22)
pdf.drawString(72, 770, "Editable PDF Sample")
pdf.setFont("Helvetica", 12)
pdf.drawString(72, 735, "This sentence should appear in the Markdown editor.")
pdf.drawString(72, 712, "Second editable line for PDF import verification.")
pdf.save()
