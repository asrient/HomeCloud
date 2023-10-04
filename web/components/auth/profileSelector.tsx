import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCallback, useEffect, useState } from 'react';
import { login, LoginParams, listProfiles } from '@/lib/api/auth';
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { nameToInitials } from '@/lib/utils';
import {
    Card,
    CardFooter,
    CardHeader,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import LoadingIcon from "../ui/loadingIcon";
import { Profile } from "@/lib/types";

function ProfileHero(profile: Profile) {
    return (<div className="flex flex-col justify-center items-center">
        <Avatar className="h-16 w-16">
            <AvatarFallback>
                {nameToInitials(profile.name)}
            </AvatarFallback>
        </Avatar>
        <div className="text-lg font-semibold">{profile.name}</div>
        {profile.username && <div className="text-[0.7rem] text-slate-500">{profile.username}</div>}
    </div>);
}

function ProfileCard({
    profile,
    onSelect,
}: {
    profile: Profile;
    onSelect: (profile: Profile) => Promise<void>;
}) {

    const [isLoading, setIsLoading] = useState(false);

    const handleOnClick = useCallback(async () => {
        setIsLoading(true);
        await onSelect(profile);
        setIsLoading(false);
    }, [onSelect, profile]);

    return (
        <Card className="flex flex-col justify-between shadow-none h-[12rem] bg-gray-0">
            <CardHeader className="p-5 pb-0">
                <ProfileHero {...profile} />
            </CardHeader>
            <CardFooter className="p-2">
                <Button disabled={isLoading} className="w-full" variant='default' onClick={handleOnClick}>
                    {isLoading ? 'Please wait..' : 'Select'}
                </Button>
            </CardFooter>
        </Card>);
}

function ProfilePasswordForm({
    profile,
    onSubmit,
}: {
    profile: any;
    onSubmit: (params: LoginParams) => Promise<void>;
}) {
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const submit = useCallback(async () => {
        setIsLoading(true);
        await onSubmit({
            username: profile.username,
            password,
        });
        setIsLoading(false);
    }, [onSubmit, password, profile]);

    return (<div className="flex flex-col">
        <div className="p-2">
            <ProfileHero {...profile} />
        </div>
        <div className="mb-2 text-sm font-semibold">Enter password</div>
        <Input
            className="w-full"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
        />
        <Button disabled={isLoading} className="w-full mt-2" variant='default' onClick={submit}>
            {isLoading ? 'Please wait..' : 'Login'}
        </Button>
    </div>);
}

export default function ProfileSelector({
    onLoginSucess,
    onNoProfiles = () => { },
}: {
    onLoginSucess: () => void,
    onNoProfiles?: () => void,
}) {

    const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
    const [profiles, setProfiles] = useState<Profile[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchProfiles() {
            try {
                const data = await listProfiles();
                setProfiles(data.profiles);
                if (!data.profiles || !data.profiles.length) {
                    onNoProfiles();
                }
            } catch (error: any) {
                console.error(error);
                setError(error.message);
            }
        }
        fetchProfiles();
    }, []);

    const performLogin = useCallback(async (params: LoginParams) => {
        try {
            await login(params);
        } catch (error: any) {
            console.error(error);
            setError(error.message);
            return;
        }
        onLoginSucess();
    }, [onLoginSucess]);

    const onProfileSelect = useCallback(async (profile: Profile) => {
        if (!profile.isPasswordProtected) {
            await performLogin({
                profileId: profile.id,
            });
        } else {
            setSelectedProfile(profile);
        }
    }, [performLogin, setSelectedProfile]);

    const onCancel = useCallback(() => {
        setSelectedProfile(null);
        setError(null);
    }, [setSelectedProfile, setError]);

    return (
        <div>
            {
                selectedProfile && (
                    <div className="flex justify-end">
                        <Button variant='ghost' className="text-blue-500" onClick={onCancel}>
                            Cancel
                        </Button>
                    </div>
                )
            }
            {error && (<div className="text-red-500">{error}</div>)}
            {
                selectedProfile ? (<ProfilePasswordForm
                    profile={selectedProfile}
                    onSubmit={performLogin}
                />)
                    : !profiles ? (
                        <div className="h-[20rem] flex justify-center items-center">
                            <LoadingIcon />
                        </div>
                    ) : profiles.length ? (<ScrollArea className="h-[28rem] w-full">
                        <div className="flex flex-row flex-wrap justify-center">
                            {profiles?.map(profile => (
                                <div key={profile.id} className="p-1 basis-1/2">
                                    <ProfileCard
                                        profile={profile}
                                        onSelect={onProfileSelect}
                                    />
                                </div>
                            ))}
                        </div>
                    </ScrollArea>) :
                        (<div className="flex flex-col items-center justify-center h-[20rem]">
                            <div className="text-gray-500">No profiles found.</div>
                        </div>)
            }
        </div>);
}
