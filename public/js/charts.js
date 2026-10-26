/**
 * SmartPocket Chart Visualizations
 * Powered by local Chart.js bundle with responsive canvas management and graceful fallback.
 */

let trendChartInstance = null;
let categoryChartInstance = null;

/**
 * Renders or updates the Spending Trend chart.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ date: string, amountPaise: number }>} dailyData
 * @param {number} safeDailyPaise
 */
export function renderSpendingTrendChart(canvas, dailyData = [], safeDailyPaise = 0) {
  if (!canvas || !window.Chart) return;

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const labels = dailyData.map(d => {
    const parts = d.date.split('-');
    return `${parts[2]}/${parts[1]}`;
  });
  const valuesRupees = dailyData.map(d => (d.amountPaise / 100));
  const safeLine = dailyData.map(() => (safeDailyPaise / 100));

  const ctx = canvas.getContext('2d');
  trendChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No Data'],
      datasets: [
        {
          label: 'Daily Spending (₹)',
          data: valuesRupees.length ? valuesRupees : [0],
          backgroundColor: '#173F35',
          borderRadius: 6,
          barThickness: 16
        },
        {
          label: 'Safe Daily Pace (₹)',
          data: safeLine.length ? safeLine : [0],
          type: 'line',
          borderColor: '#A8B9A5',
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 2,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: "'Inter', sans-serif", size: 12 },
            color: '#737C74'
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => ` ₹${context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#737C74', font: { size: 11 } }
        },
        y: {
          grid: { color: '#E6E8E1' },
          ticks: {
            color: '#737C74',
            font: { size: 11 },
            callback: (val) => `₹${val}`
          }
        }
      }
    }
  });
}

/**
 * Renders or updates the Category Distribution Doughnut chart.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ category_name: string, total_paise: number, color?: string }>} categories
 */
export function renderCategoryDistributionChart(canvas, categories = []) {
  if (!canvas || !window.Chart) return;

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  const activeCategories = categories.filter(c => c.total_paise > 0);
  const labels = activeCategories.length ? activeCategories.map(c => c.category_name) : ['No Expenses Recorded'];
  const dataRupees = activeCategories.length ? activeCategories.map(c => (c.total_paise / 100)) : [1];

  const defaultPalette = ['#173F35', '#2E7D32', '#D97706', '#DC2626', '#9333EA', '#1565C0', '#00695C', '#E11D48'];
  const backgroundColors = activeCategories.length
    ? activeCategories.map((c, i) => c.color || defaultPalette[i % defaultPalette.length])
    : ['#E6E8E1'];

  const ctx = canvas.getContext('2d');
  categoryChartInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: dataRupees,
          backgroundColor: backgroundColors,
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            font: { family: "'Inter', sans-serif", size: 11 },
            color: '#202923'
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (!activeCategories.length) return ' No expense data';
              return ` ${context.label}: ₹${context.parsed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            }
          }
        }
      }
    }
  });
}

