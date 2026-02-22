# Member Plebiscite Platform

A secure, transparent online voting platform for conducting membership plebiscites and surveys. Built with Next.js 14, TypeScript, and SQLite.

## Features

### 🗳️ **Secure Voting System**
- **Email Verification**: 6-digit codes sent via Resend API for member authentication
- **Anonymous Voting**: Votes are stored separately from voter identity
- **Receipt Codes**: Verifiable vote receipts without revealing choices
- **One Vote Per Member**: Enforced at database level with participation tracking

### 📊 **Multiple Question Types**
- **Yes/No Questions**: Simple binary choices
- **Multiple Choice**: Select one or more options
- **Ranked Choice**: Drag-to-rank interface with Instant Runoff Voting (IRV) tabulation

### 👥 **Admin Management**
- **Password Protection**: Simple admin authentication via environment variable
- **Plebiscite Lifecycle**: Create → Open → Close → Results
- **Voter Roll Management**: CSV upload and individual email management
- **Real-time Stats**: Participation tracking and results analytics

### 🔐 **Security & Privacy**
- **Rate Limiting**: Max 3 verification codes per email per hour
- **Code Expiration**: Verification codes expire after 10 minutes
- **Anonymous Storage**: No linkage between voter identity and actual votes
- **CSRF Protection**: Built-in Next.js security features

### 📱 **Mobile-First Design**
- **Responsive Layout**: Works seamlessly on all devices
- **Accessible Interface**: Clean, intuitive user experience
- **Green Branding**: Professional color scheme (#00843D primary)

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Database**: SQLite via better-sqlite3
- **Email**: Resend API
- **Styling**: Tailwind CSS
- **Authentication**: Custom session management

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup

1. **Clone and install dependencies**:
```bash
cd member-plebiscite
npm install
```

2. **Environment Configuration**:
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
# Admin Authentication
ADMIN_PASSWORD=your-secure-admin-password-here

# Email Configuration (Resend API)
RESEND_API_KEY=your-resend-api-key-here
FROM_EMAIL=noreply@yourorganization.com

# Database (automatically created)
DATABASE_PATH=./plebiscite.db

# Security (generate a random string)
JWT_SECRET=your-jwt-secret-key-for-sessions

# Environment
NODE_ENV=production
```

3. **Build and start**:
```bash
npm run build
npm start
```

The application will be available at `http://localhost:3000`.

## Usage

### For Administrators

1. **Initial Setup**:
   - Visit `/admin` and login with your admin password
   - Upload voter roll via CSV or add individual emails
   - Create your first plebiscite

2. **Create a Plebiscite**:
   - Go to **Admin Panel** → **Create Plebiscite**
   - Add title, description, and voting period
   - Configure questions (Yes/No, Multiple Choice, or Ranked Choice)
   - Set open and close dates

3. **Launch Voting**:
   - Open the plebiscite when ready
   - Share the public URL: `/vote/[plebiscite-slug]`
   - Monitor participation in real-time

4. **View Results**:
   - Results are automatically available after close date
   - IRV tabulation for ranked choice questions
   - Export results as CSV

### For Voters

1. **Access the Ballot**:
   - Click the shared voting URL
   - Read plebiscite information
   - Click "Begin Voting"

2. **Verify Identity**:
   - Enter your registered email address
   - Check email for 6-digit verification code
   - Enter code to access ballot

3. **Cast Your Vote**:
   - Answer all questions (drag-to-rank for preferential)
   - Review your choices
   - Submit votes and save receipt codes

## Configuration

### Voter Roll CSV Format

Upload a CSV file with email addresses:

```csv
member1@example.com
member2@example.com
member3@example.com
```

Or comma-separated:
```csv
member1@example.com, member2@example.com, member3@example.com
```

### Email Templates

The platform automatically sends HTML emails with:
- Organization branding
- Verification codes with 10-minute expiration
- Clean, mobile-friendly design

### Database Schema

The SQLite database automatically creates these tables:
- `plebiscites`: Main plebiscite records
- `questions`: Question definitions and options
- `voter_roll`: Registered voter email addresses
- `verification_codes`: Temporary email verification codes
- `votes`: Anonymous vote records with receipt codes
- `participation`: Voter participation tracking (no vote linkage)

## IRV (Instant Runoff Voting)

For ranked choice questions, the platform implements proper IRV tabulation:

1. **Count First Preferences**: Initial vote tallies
2. **Check for Majority**: If >50%, declare winner
3. **Eliminate Lowest**: Remove candidate with fewest votes
4. **Redistribute Votes**: Move to next preferences
5. **Repeat**: Continue until winner found
6. **Track Rounds**: Display full elimination process

## Security Considerations

### Vote Privacy
- Votes are stored in separate table from voter participation
- Receipt codes allow verification without revealing choices
- No database foreign keys link voters to their specific votes

### Rate Limiting
- Maximum 3 verification codes per email per hour
- Codes expire after 10 minutes
- Cooldown timers prevent spam

### Admin Security
- Simple password authentication (consider stronger auth for production)
- All admin routes protected
- No public access to sensitive data

## Deployment

### Vercel (Recommended)
1. Push to GitHub
2. Connect to Vercel
3. Add environment variables
4. Deploy automatically

### Traditional Hosting
1. Build the application: `npm run build`
2. Upload to your server
3. Configure environment variables
4. Use PM2 or similar for process management

### Database Backup
The SQLite database file should be backed up regularly:
```bash
cp plebiscite.db plebiscite-backup-$(date +%Y%m%d).db
```

## API Endpoints

### Public Endpoints
- `POST /api/auth/verify` - Send verification code
- `POST /api/auth/confirm` - Confirm email code
- `POST /api/vote` - Submit votes
- `GET /api/results/[slug]` - Get results (after close)

### Admin Endpoints
- `POST /api/admin/auth` - Admin login/logout
- `GET|POST|PUT|DELETE /api/admin/plebiscites` - Manage plebiscites
- `GET|POST|DELETE /api/admin/voters` - Manage voter roll

## Customization

### Branding
Edit `src/app/globals.css` to customize colors:
```css
:root {
  --primary: #00843D;        /* Main green */
  --primary-dark: #1B5E20;   /* Dark green */
  --primary-light: #4CAF50;  /* Light green */
}
```

### Email Templates
Modify `src/lib/email.ts` to customize email content and styling.

### UI Components
All components are in `src/components/` and use Tailwind CSS for styling.

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure DATABASE_PATH directory exists and is writable
2. **Email Delivery**: Verify Resend API key and FROM_EMAIL domain verification
3. **Build Errors**: Check TypeScript types and ensure all dependencies are installed
4. **Session Issues**: Verify JWT_SECRET is set and cookies are enabled

### Development Mode

Run in development with hot reloading:
```bash
npm run dev
```

### Logs

Check application logs for debugging:
- Database operations are logged to console
- Email sending results are logged
- Error states include detailed messages

## Contributing

This is a production-ready voting platform. Key areas for enhancement:

1. **Advanced Security**: Two-factor authentication, encryption at rest
2. **Scalability**: PostgreSQL support, Redis sessions
3. **Features**: Vote delegation, multi-language support
4. **Analytics**: Advanced reporting, export formats
5. **Accessibility**: Enhanced screen reader support

## License

This project is open source. Please ensure compliance with local election laws and regulations when deploying for official use.

## Support

For technical support or customization requests, please refer to the code comments and documentation within the source files. All components are thoroughly documented and follow Next.js best practices.