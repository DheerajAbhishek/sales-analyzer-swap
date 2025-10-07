# Sales Insights Dashboard - React + Vite

A modern, responsive sales analytics dashboard built with React, Vite, and Chart.js featuring a sleek black & white theme.

## ✨ Features

- 📊 **Interactive Charts** - Beautiful visualizations with Chart.js
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- ⚡ **Fast Performance** - Built with Vite for lightning-fast development
- 🎨 **Black & White Theme** - Clean, professional design
- 📈 **Real-time Data** - Connect to AWS API endpoints
- 💰 **P&L Analysis** - Comprehensive profit & loss tracking
- 📁 **File Upload** - Batch process Excel/CSV files
- 🔄 **Multi-restaurant Support** - Handle multiple locations and channels

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Navigate to the project directory:**
   ```bash
   cd sales-dashboard-vite
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   - The app will open automatically at `http://localhost:3000`
   - Or manually visit `http://localhost:3000`

### Build for Production

```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
sales-dashboard-vite/
├── src/
│   ├── components/
│   │   ├── Controls/           # Upload & filter controls
│   │   ├── Dashboard/          # Main dashboard components
│   │   ├── Charts/            # Chart visualizations
│   │   └── PnL/               # Profit & Loss section
│   ├── services/              # API service functions
│   ├── utils/                 # Helper functions & constants
│   ├── styles/                # Global CSS styles
│   ├── App.jsx                # Main app component
│   └── main.jsx               # App entry point
├── index.html                 # HTML template
├── vite.config.js            # Vite configuration
└── package.json              # Dependencies & scripts
```

## 🎨 Design Features

### Black & White Theme
- **Primary Black**: `#1a1a1a` - Main text and borders
- **Secondary Black**: `#2d2d2d` - Hover states
- **Gray Tones**: `#6c757d` - Secondary text
- **Clean White**: `#ffffff` - Card backgrounds
- **Off White**: `#f8f9fa` - Page background

### Components
- **Responsive Cards** - Hover effects and clean borders
- **Interactive Charts** - Custom Chart.js styling
- **Form Controls** - Modern input styling with focus states
- **Status Indicators** - Color-coded success/error messages
- **Typography** - Clean, professional fonts with proper hierarchy

## 📊 Dashboard Features

### Upload Section
- Drag & drop file upload
- Support for Excel (.xlsx, .xls) and CSV files
- Real-time upload progress tracking
- Batch processing with job status polling

### Report Controls
- Multi-select restaurants and channels
- Date range picker with Flatpickr
- Group by options (Total, Week, Month)
- Form validation and selection summary

### Data Visualization
- **Summary Cards** - Key metrics with icons
- **Comparison Charts** - Restaurant/channel comparisons
- **Time Series** - Trend analysis over time
- **Interactive Tooltips** - Detailed hover information

### P&L Analysis
- Monthly expense tracking
- Percentage calculations against gross sales
- Save/load expense data
- Professional table formatting

## 🔧 Configuration

### API Endpoints
Update the API base URL in `src/utils/constants.js`:
```javascript
export const API_BASE_URL = "your-api-endpoint-here";
```

### Restaurant Configuration
Modify restaurant mappings in `src/utils/constants.js`:
```javascript
export const RESTAURANT_ID_MAP = {
  // Add your restaurant configurations
};
```

### Chart Colors
Customize chart colors in `src/utils/constants.js`:
```javascript
export const CHART_COLORS = {
  zomato: "#1a1a1a",
  swiggy: "#6c757d"
};
```

## 📱 Responsive Design

- **Desktop** (1024px+): Full two-column layout
- **Tablet** (768px-1023px): Stacked layout with optimized spacing
- **Mobile** (< 768px): Single column with touch-friendly controls

## 🛠️ Development

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Code Structure
- **JSX Components** - Modern React functional components
- **Hooks** - useState, useEffect for state management
- **Services** - Centralized API calls
- **Utils** - Helper functions and constants
- **CSS Variables** - Consistent theming system

## 📦 Dependencies

### Core
- **React 18** - Modern React with hooks
- **Vite 4** - Fast build tool and dev server

### UI & Charts
- **Chart.js 4** - Powerful charting library
- **react-chartjs-2** - React wrapper for Chart.js
- **Flatpickr** - Date range picker

### Development
- **@vitejs/plugin-react** - Vite React plugin

## 🎯 Usage Tips

1. **File Upload**: Start by uploading your sales report files
2. **Select Parameters**: Choose restaurants, channels, and date ranges
3. **View Insights**: Analyze the generated charts and summaries
4. **P&L Tracking**: For monthly reports, enter expenses for detailed P&L analysis
5. **Export Data**: Use browser print/PDF for report sharing

## 🐛 Troubleshooting

### Common Issues
- **Charts not loading**: Ensure Chart.js is properly imported
- **Date picker not working**: Check if Flatpickr CSS is loaded
- **API errors**: Verify the API_BASE_URL configuration
- **Build errors**: Clear node_modules and reinstall dependencies

### Performance
- Use `npm run build` for optimized production builds
- Enable gzip compression on your server
- Consider lazy loading for heavy chart components

## 📄 License

This project is part of a sales analytics system for restaurant management.

---

**Built with ❤️ using React + Vite**