import { NextRequest, NextResponse } from 'next/server';
import {
  buildResultsCsv,
  getPlebisciteResults,
  ResultsUnavailableError,
  resultsCsvFilename
} from '@/lib/results';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const url = new URL(request.url);
    const format = url.searchParams.get('format'); // 'csv' for CSV export
    const results = getPlebisciteResults(slug);

    if (format === 'csv') {
      return new NextResponse(buildResultsCsv(slug, results), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${resultsCsvFilename(slug)}"`
        }
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof ResultsUnavailableError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Results API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
