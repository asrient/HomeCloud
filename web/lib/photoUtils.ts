
const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

export function dateToTitle(date: Date, type: 'day' | 'month' | 'year' = 'day', today: Date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    const yearMatch = today.getFullYear() === year;
    const monthMatch = yearMatch && today.getMonth() === month;
    const dayMatch = monthMatch && today.getDate() === day;

    switch (type) {
        case 'day':
            if (dayMatch) {
                return 'Today';
            } else if (monthMatch && today.getDate() === day + 1) {
                return 'Yesterday';
            }
            return `${months[month]} ${day}, ${year}`;
        case 'month':
            if (monthMatch) {
                return 'This Month';
            } else if (yearMatch && today.getMonth() === month + 1) {
                return 'Last Month';
            }
            return `${months[month]} ${year}`;
        case 'year':
            if (yearMatch) {
                return 'This Year';
            }
            return `${year}`;
    }
}
