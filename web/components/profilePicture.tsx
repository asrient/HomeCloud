import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { nameToInitials } from '@/lib/utils';
import { Profile } from "@/lib/types";

export default function ProfilePicture({ profile, size }: { profile: Profile, size?: 'sm' | 'md' | 'lg' }) {
    size = size || 'md';

    const sizeMap = {
        'sm': 'h-[2rem] w-[2rem]',
        'md': 'h-[3.5rem] w-[3.5rem]',
        'lg': 'h-[6rem] w-[6rem]',
    }

    return (<Avatar className={`${sizeMap[size]} border border-solid`}>
        <AvatarFallback>
            {nameToInitials(profile.name)}
        </AvatarFallback>
    </Avatar>);
}
