import { PhotoLibrary, PhotosSortOption, PhotoView } from "./types";

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

// check if the list is actually sorted
function isListSorted(list: PhotoView[], sortBy: PhotosSortOption, ascending: boolean) {
    for (let i = 0; i < list.length - 1; i++) {
        const a = list[i];
        const b = list[i + 1];
        if (ascending) {
            if (a[sortBy] > b[sortBy]) {
                return false;
            }
        } else {
            if (a[sortBy] < b[sortBy]) {
                return false;
            }
        }
    }
    return true;
}

export function mergePhotosList(sortedLists: PhotoView[][], sortBy: PhotosSortOption, ascending: boolean, endMarker: PhotoView | null = null): {
    merged: PhotoView[],
    discarded: PhotoView[][],
} {
    console.log('Storted lists to merge:', sortedLists);

    // // Debug: check if the lists are actually sorted
    // sortedLists.forEach((list, i) => {
    //     if(!isListSorted(list, sortBy, ascending)) {
    //         console.error('List', i, 'is not sorted');
    //     } else {
    //         console.log('List', i, 'is sorted');
    //     }
    // });

    sortedLists = sortedLists.filter((list) => list.length > 0);
    if (!endMarker) {
        const endMarkerInd = comesFirst(sortedLists.map((list) => list[list.length - 1]).reverse(), sortBy, ascending);
        endMarker = sortedLists[endMarkerInd][sortedLists[endMarkerInd].length - 1];
    }
    // console.log('End marker:', endMarker);
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

export function libraryHash(library: PhotoLibrary) {
    return libraryHashFromId(library.storageId, library.id);
}

export function libraryHashFromId(storageId: number, libraryId: number) {
    return `${storageId}-${libraryId}`;
}
