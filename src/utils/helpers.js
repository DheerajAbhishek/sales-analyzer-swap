export const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0
});

export const formatValue = (value, type) => {
    switch (type) {
        case 'currency':
            return formatter.format(value || 0);
        case 'percent':
            return `${(value || 0).toFixed(2)}%`;
        case 'number':
        default:
            return (value || 0).toLocaleString('en-IN');
    }
};

export const formatChartValue = (value, type) => {
    if (type === 'percent') return `${value}%`;
    if (type === 'currency') {
        if (Math.abs(value) >= 100000) return '₹' + (value / 100000).toFixed(2) + 'L';
        if (Math.abs(value) >= 1000) return '₹' + (value / 1000).toFixed(1) + 'k';
        return '₹' + value;
    }
    return value;
};

export const validateSelections = (restaurants, channels, startDate, endDate) => {
    return restaurants.length > 0 && channels.length > 0 && startDate && endDate;
};

export const isFullMonthSelection = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const isFullMonth = start.getDate() === 1 &&
        new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate() === end.getDate();
    return isFullMonth;
};

export const formatWeekPeriod = (period) => {
    if (!period) return period;

    // Convert YYYY-MM-DD format to readable week range
    const startDate = new Date(period);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // Add 6 days for week end

    const formatDate = (date) => {
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit'
        });
    };

    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};