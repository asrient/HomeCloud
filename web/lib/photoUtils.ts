import { PhotosSortOption, PhotoView } from "./types";

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

function comesFirst(photos: PhotoView[], sortBy: PhotosSortOption, ascending: boolean): number {
    switch (sortBy) {
        case PhotosSortOption.CapturedOn:
        case PhotosSortOption.AddedOn:
            if (ascending) {
                let min: number | null = null;
                photos.forEach((photo, i) => {
                    if (!photo) return;
                    if (min === null || photo[sortBy] < photos[min][sortBy]) {
                        min = i;
                    }
                });
                if (min === null) throw new Error(`Emply list passed to comesFirst for ${sortBy}`);
                return min;
            } else {
                let max: number | null = null;
                photos.forEach((photo, i) => {
                    if (!photo) return;
                    if (max === null || photo[sortBy] > photos[max][sortBy]) {
                        max = i;
                    }
                });
                if (max === null) throw new Error(`Emply list passed to comesFirst for ${sortBy}`);
                return max;
            }
        default:
            throw new Error(`Sort by ${sortBy} not implemented.`);
    }
}

export function mergePhotosList(sortedLists: PhotoView[][], sortBy: PhotosSortOption, ascending: boolean, endMarker: PhotoView | null = null): {
    merged: PhotoView[],
    discarded: PhotoView[][],
} {
    sortedLists = sortedLists.filter((list) => list.length > 0);
    if (!endMarker) {
        const endMarkerInd = comesFirst(sortedLists.map((list) => list[list.length - 1]), sortBy, ascending);
        endMarker = sortedLists[endMarkerInd][sortedLists[endMarkerInd].length - 1];
    }
    let totalLength = 0;
    sortedLists.forEach((list) => totalLength += list.length);
    const merged: PhotoView[] = [];
    const currentInd: number[] = sortedLists.map(() => 0);
    let endMarkerReached = false;
    while (merged.length < totalLength) {
        const firsts = sortedLists.map((list, i) => list[currentInd[i]]);
        const ind = comesFirst(firsts, sortBy, ascending);
        const first = firsts[ind];
        merged.push(first);
        currentInd[ind]++;
        if (first === endMarker) {
            endMarkerReached = true;
        }
        else if (endMarkerReached && (comesFirst([first, endMarker], sortBy, ascending) === 1)) {
            merged.pop();
            currentInd[ind]--;
            break;
        }
    }
    const discarded = sortedLists.map((list, i) => list.slice(currentInd[i]));
    return { merged, discarded };
}

export function sortPhotos(photos: PhotoView[], sortBy: PhotosSortOption, ascending: boolean) {
    return photos.sort((a, b) => {
        const ind = comesFirst([a, b], sortBy, ascending);
        return ind === 0 ? -1 : 1;
    });
}
