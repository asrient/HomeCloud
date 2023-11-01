import { useForm } from 'react-hook-form';
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormRootError,
    errorToFormError,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useCallback, useEffect, useRef, useState } from 'react';
import { signup, SignupParams } from '@/lib/api/auth';
import { useAppState } from '../hooks/useAppState';
import { OptionalType } from '@/lib/types';
import { isDesktop } from '@/lib/staticConfig';

const signupFormSchema = z.object({
    name: z.string().min(2).max(50),
    username: z.string().max(50),
    password: z.string().max(50),
})

export default function SignupForm({
    onLoginSucess,
    isFirstProfile = false,
}: {
    onLoginSucess: () => void,
    isFirstProfile?: boolean,
}) {

    const form = useForm<z.infer<typeof signupFormSchema>>({
        resolver: zodResolver(signupFormSchema),
        defaultValues: {
            username: "",
            password: "",
            name: "",
        },
    });

    const [prefersPassword, setPrefersPassword] = useState(false);
    const { serverConfig } = useAppState();
    const [isSubmitting, setIsSubmitting] = useState(false);

    function onFormSubmit(values: z.infer<typeof signupFormSchema>) {
        // This will be type-safe and validated.
        const params: SignupParams = {
            name: values.name,
        };
        if (!!values.username) {
            params.username = values.username;
        }
        if (!!values.password) {
            params.password = values.password;
        }
        performSignup(params);
    }

    const performSignup = useCallback(async (params: SignupParams) => {
        setIsSubmitting(true);
        try {
            await signup(params);
        } catch (error: any) {
            console.error(error);
            errorToFormError(error, form);
            return;
        } finally {
            setIsSubmitting(false);
        }
        onLoginSucess();
    }, [form, onLoginSucess]);

    const autoCreateHit = useRef(false);

    useEffect(() => {
        if (serverConfig
            && !autoCreateHit.current
            && isFirstProfile
            && isDesktop()
            && [OptionalType.Optional, OptionalType.Disabled].includes(serverConfig.passwordPolicy)
            && !serverConfig.requireUsername) {
            autoCreateHit.current = true;
            console.log(`Welcome to HomeCloud Desktop, creating your first profile..`);
            performSignup({
                name: 'Profile 1',
            })
        }
    }, [isFirstProfile, serverConfig, performSignup]);

    const showPasswordField = (serverConfig?.passwordPolicy === OptionalType.Optional && prefersPassword)
        || serverConfig?.passwordPolicy === OptionalType.Required;

    return (
        <Form {...form}>
            <FormMessage />
            <FormRootError />
            <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Profile Name</FormLabel>
                            <FormControl>
                                <Input placeholder="name" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {serverConfig?.requireUsername && <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                                <Input placeholder="username" {...field} />
                            </FormControl>
                            <FormDescription>
                                This is your unique public identity.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />}
                {showPasswordField && <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input type='password' placeholder="password" {...field} />
                            </FormControl>
                            <FormDescription>
                                {
                                    serverConfig?.passwordPolicy === OptionalType.Required
                                        ? 'Required.'
                                        : 'Optional.'
                                }
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />}
                {(serverConfig?.passwordPolicy === OptionalType.Optional && !prefersPassword) &&
                    <div>
                        <Button variant="ghost" className='text-blue-500' type="button" onClick={() => setPrefersPassword(true)}>
                            Set a Password
                        </Button>
                    </div>}
                <Button size='lg' disabled={isSubmitting} className='w-full' type="submit">Create profile</Button>
            </form>
        </Form>
    )
}
