import { useState } from "react";
import { useAppState } from "./hooks/useAppState";
import TextModal, { TextModalProps } from "./textModal";
import { Label } from "./ui/label";
import { Input } from "./ui/input";

export default function TextModalProtected(props: {
    onDone: (text: string, password: string) => Promise<void>,
} & Omit<TextModalProps, 'onDone'>) {
    const { profile } = useAppState();
    const [currentPassword, setCurrentPassword] = useState<string>('');

    const additionalContent = profile && profile.isPasswordProtected && (
        <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label>
                {
                    props.textType === 'password' ? 'Current Password' : 'Password'
                }
            </Label>
            <Input onChange={(e) => setCurrentPassword(e.target.value)}
                value={currentPassword}
                placeholder="password"
                name="Password"
                type='password' />
        </div>
    )

    return (
        <TextModal
            {...props}
            additionalContent={additionalContent}
            onDone={async (text: string) => {
                await props.onDone(text, currentPassword);
            }}
        />
    )
}
