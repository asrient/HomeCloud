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
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useCallback, useState } from 'react';
import { signup, SignupParams } from '@/lib/api/auth';
import { useAppState } from '../hooks/useAppState';

const signupFormSchema = z.object({
    name: z.string().min(2).max(50),
    username: z.string().max(50),
    password: z.string().max(50),
})

export default function SignupForm({
    onLoginSucess,
}: {
    onLoginSucess: () => void
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

    function onFormSubmit(values: z.infer<typeof signupFormSchema>) {
        // This will be type-safe and validated.
        console.log(values);
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
        try {
            await signup(params);
        } catch (error: any) {
            console.error(error);
            form.setError("name", {
                type: "value",
                message: error.message,
            });
            return;
        }
        onLoginSucess();
    }, [form, onLoginSucess]);

    const showPasswordField = (serverConfig?.passwordPolicy === 'optional' && prefersPassword)
        || serverConfig?.passwordPolicy === 'required';

    return (
        <Form {...form}>
            <FormMessage />
            <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-8">
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
                                    serverConfig?.passwordPolicy === 'required'
                                        ? 'Required.'
                                        : 'Not mandatory.'
                                }
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />}
                {(serverConfig?.passwordPolicy === 'optional' && !prefersPassword) &&
                    <div>
                        <Button variant="ghost" className='text-blue-500' type="button" onClick={() => setPrefersPassword(true)}>
                            Set a Password
                        </Button>
                    </div>}
                <Button size='lg' className='w-full' type="submit">Create profile</Button>
            </form>
        </Form>
    )
}
