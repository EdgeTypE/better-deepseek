const DOCX = { 
    Document: class {}, 
    Packer: { toBlob: () => Promise.resolve() }, 
    Paragraph: class {}, 
    TextRun: class {}, 
    AlignmentType: { CENTER: 1, JUSTIFIED: 2 }, 
    BorderStyle: { SINGLE: 1 } 
};

try {
    const jsCode = `
const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = DOCX;

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({
                children: [new TextRun({ text: "RICHARD P. FEYNMAN", bold: true, size: 48, font: "Times New Roman" })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 100, after: 100 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "Physicist · Nobel Laureate · Teacher · Storyteller", size: 24, italics: true, font: "Times New Roman" })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "📧 feynman@caltech.edu  •  📍 Pasadena, California  •  📞 +1 (626) 395-6811", size: 22, font: "Times New Roman" })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "PROFESSIONAL SUMMARY", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [new TextRun({ text: "Theoretical physicist with profound contributions to quantum mechanics, quantum electrodynamics, and superfluidity. Nobel Prize winner for fundamental work in QED. Renowned for exceptional ability to communicate complex scientific concepts with clarity and wit. Pioneer of nanotechnology, quantum computing, and particle physics. Beloved educator whose lectures continue to inspire generations of scientists worldwide.", size: 22, font: "Times New Roman" })],
                spacing: { after: 300 },
                alignment: AlignmentType.JUSTIFIED
            }),
            new Paragraph({
                children: [new TextRun({ text: "EDUCATION", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Ph.D. in Physics", bold: true, size: 24, font: "Times New Roman" }),
                    new TextRun({ text: " — Princeton University, 1942", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Dissertation: ", italics: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "\\"The Principle of Least Action in Quantum Mechanics\\" under John Archibald Wheeler", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "B.Sc. in Physics", bold: true, size: 24, font: "Times New Roman" }),
                    new TextRun({ text: " — Massachusetts Institute of Technology, 1939", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "AWARDS & HONORS", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• Nobel Prize in Physics", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (1965) — for fundamental work in quantum electrodynamics, shared with J. Schwinger and S. Tomonaga", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• Albert Einstein Award", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (1954)", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• E. O. Lawrence Award", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (1962)", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• Oersted Medal", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (1972) — for notable contributions to the teaching of physics", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• National Medal of Science", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (1979)", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• Foreign Member of the Royal Society", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (1965)", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "PROFESSIONAL EXPERIENCE", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Richard Chace Tolman Professor of Theoretical Physics", bold: true, size: 24, font: "Times New Roman" }),
                    new TextRun({ text: " — California Institute of Technology, 1951–1988", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Professor of Physics", bold: true, size: 24, font: "Times New Roman" }),
                    new TextRun({ text: " — Cornell University, 1945–1951", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Group Leader, Theoretical Division", bold: true, size: 24, font: "Times New Roman" }),
                    new TextRun({ text: " — Manhattan Project, Los Alamos Laboratory, 1943–1945", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "MAJOR SCIENTIFIC CONTRIBUTIONS", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Quantum Electrodynamics (QED)", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " — Developed the path integral formulation and Feynman diagrams, revolutionizing the calculation of particle interactions. This work provided the first complete and consistent theory of the interaction of light and matter.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Superfluidity of Liquid Helium", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " — Provided a quantum mechanical explanation for the bizarre behavior of superfluid helium-4, introducing the concept of rotons and quantized vortices.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Weak Interaction and Parton Model", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " — Proposed the V-A theory of weak interactions with Murray Gell-Mann and introduced the parton model, a precursor to the quark model in high-energy physics.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Nanotechnology", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " — In the seminal 1959 lecture \\"There's Plenty of Room at the Bottom,\\" envisioned the manipulation of individual atoms and molecules, effectively founding the field of nanotechnology.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Quantum Computing", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " — Early conceptual contributions suggesting that quantum systems could be used to perform computations more efficiently than classical computers.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "SELECTED PUBLICATIONS", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "The Feynman Lectures on Physics", italics: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (with Robert B. Leighton and Matthew Sands), 1964", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "QED: The Strange Theory of Light and Matter", italics: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: ", 1985", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "Surely You're Joking, Mr. Feynman!", italics: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (with Ralph Leighton), 1985", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "What Do You Care What Other People Think?", italics: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " (with Ralph Leighton), 1988", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "The Character of Physical Law", italics: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: ", 1965", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "SERVICE & LEGACY", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "Member of the Rogers Commission", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " investigating the Space Shuttle Challenger disaster (1986). Famously demonstrated the effect of cold on O-ring seals during a televised hearing.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "Consultant and Lecturer", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " at Hughes Aircraft, Thinking Machines Corporation, and numerous international institutions.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "• ", size: 22, font: "Times New Roman" }),
                    new TextRun({ text: "Feynman Computing Center", bold: true, size: 22, font: "Times New Roman" }),
                    new TextRun({ text: " at Fermilab and the Richard P. Feynman Chair in Theoretical Physics at Caltech named in his honor.", size: 22, font: "Times New Roman" })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [new TextRun({ text: "PERSONAL PURSUITS", bold: true, size: 28, font: "Times New Roman" })],
                spacing: { before: 200, after: 150 },
                border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }),
            new Paragraph({
                children: [new TextRun({ text: "Avid bongo and frigideira player; accomplished safe-cracker; amateur artist (under the pseudonym 'Ofey'); enthusiastic decipherer of Mayan hieroglyphics; and a lifelong curiosity for the natural world.", size: 22, font: "Times New Roman" })],
                spacing: { after: 300 }
            })
        ]
    }]
});

Packer.toBlob(doc).then(blob => {
    console.log("Success");
});
    `;
    new Function('DOCX', jsCode)(DOCX);
    console.log("Syntax is OK");
} catch (e) {
    console.error("Syntax Error found:", e.message);
}
