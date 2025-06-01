import { generateReport } from '../util/report-generator';  // replace with your actual path

const format = {
  title: 'Test Report',
  description: 'Testing URL sanitization',
  headers: ['Name', 'Link'],
  fileName: 'test-report'
};

const data = [
  ['Example', 'https://www.example.com'],
  ['Google', 'http://www.google.com/search?q=test'],
  ['Not a URL', 'random text here'],
  ['Number', 12345]
];

const eventCode = 'EVT-001';

(async () => {
  const outputPath = await generateReport(format, data, eventCode);
  console.log('Report generated at:', outputPath);
})();
