# Results Report Technical Spec

## Architecture

- `src/lib/results.ts` remains the single source of truth for published result data.
- Aggregate eligibility and access mode are added to that public result model.
- `src/lib/results-report.ts` derives a stable SHA-256 report fingerprint and renders a vector PDF using PDFKit.
- `GET /api/results/[slug]?format=pdf` returns the generated report.
- The results page uses the same result model and fingerprint, preventing calculation drift between screen, CSV and PDF.

## PDF structure

1. VoteKit result certificate and election summary
2. Participation and election-period facts
3. One section per question with method-specific outcome details
4. Verification, privacy and methodology notes
5. Encrypted-election audit hashes when applicable
6. Page numbers, generation timestamp and report fingerprint

## Security

- The endpoint uses the same closed-election availability gate as JSON and CSV.
- PDF text is generated from values already approved for public results.
- Untrusted election text is rendered as text, not interpreted markup.
- Responses remain non-cacheable under the existing API headers.
- PDFKit is server-only and externalised from the Next.js bundle.

## Rollback

The change is additive. Rolling back removes PDF export and the richer presentation without changing stored election or ballot data.
