import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import confetti from "canvas-confetti";
import { supabase } from "@supabase-client/supabase/client";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Card } from "@ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Textarea } from "@ui/textarea";
import { Loader2, PartyPopper, Sparkles } from "lucide-react";
import { COUNTRIES } from "@shared/countries";
import { PhoneInput } from "@ui/phone-input";

const waitlistSchema = z.object({
  first_name: z.string().min(2, "First name is required"),
  last_name: z.string().min(2, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(8, "Phone number is required"),
  country: z.string().min(1, "Country is required"),
  plan_interest: z.string().optional(),
  team_size: z.string().optional(),
  notes: z.string().optional(),
});

type WaitlistFormData = z.infer<typeof waitlistSchema>;

interface WaitlistFormProps {
	compact?: boolean;
	mode?: "waitlist" | "interest";
}

export function WaitlistForm({
	compact = false,
	mode = "waitlist",
}: WaitlistFormProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [position, setPosition] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const form = useForm<WaitlistFormData>({
		resolver: zodResolver(waitlistSchema),
		defaultValues: {
			first_name: "",
			last_name: "",
			email: "",
			phone: "",
			country: "",
			plan_interest: "",
			team_size: "",
			notes: "",
		},
	});

	const onSubmit = async (data: WaitlistFormData) => {
		setIsSubmitting(true);
		setError(null);

		try {
			const { data: result, error: fnError } = await supabase.functions.invoke(
				"submit-waitlist",
				{
					body: data,
				},
			);

			if (fnError) {
				const errorBody = fnError.context?.body;
				if (typeof errorBody === "string") {
					try {
						const parsed = JSON.parse(errorBody);
						if (parsed.error) {
							throw new Error(parsed.error);
						}
					} catch {
						// Not JSON, use original error
					}
				}
				throw fnError;
			}

			// Check if response indicates already on waitlist
			if (result?.message?.includes("already on the waitlist")) {
				setError(
					"You've already submitted a request before now. We'll notify you when access is ready!",
				);
				return;
			}

			setPosition(result?.position || null);
			setIsSuccess(true);
		} catch (err: any) {
			console.error("Waitlist submission error:", err);
			const errorMessage = err.message || "";

			if (
				errorMessage.includes("duplicate") ||
				errorMessage.includes("unique") ||
				errorMessage.includes("already on the waitlist") ||
				errorMessage.includes("already submitted")
			) {
				setError(
					"You've already submitted a request before now. We'll notify you when access is ready!",
				);
			} else {
				setError(err.message || "Something went wrong. Please try again.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	useEffect(() => {
		if (isSuccess) {
			const duration = 3000;
			const end = Date.now() + duration;

			const frame = () => {
				confetti({
					particleCount: 3,
					angle: 60,
					spread: 55,
					origin: { x: 0 },
					colors: ["#2563EB", "#7C3AED", "#EC4899", "#F59E0B"],
				});
				confetti({
					particleCount: 3,
					angle: 120,
					spread: 55,
					origin: { x: 1 },
					colors: ["#2563EB", "#7C3AED", "#EC4899", "#F59E0B"],
				});

				if (Date.now() < end) {
					requestAnimationFrame(frame);
				}
			};

			frame();
		}
	}, [isSuccess]);

	const isInterestMode = mode === "interest";

	if (isSuccess) {
		return (
			<Card className="p-8 text-center bg-success-bg border-success/20">
				<div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
					<PartyPopper className="w-8 h-8 text-primary" />
				</div>
				<h3 className="text-xl font-medium mb-3">
					{isInterestMode
						? "Thanks for registering your interest!"
						: "Welcome to Salon Magik!"}
				</h3>
				<p className="text-muted-foreground">
					{isInterestMode
						? "We'll notify you as soon as we launch in your country."
						: "You're officially on the waitlist. We'll notify you soon when it's time to get started."}
				</p>
			</Card>
		);
	}

	if (compact) {
		return (
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
					<div className="flex flex-col sm:flex-row gap-3">
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem className="flex-1">
									<FormControl>
										<Input
											placeholder="Enter your email"
											type="email"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<>
									<Sparkles className="w-4 h-4 mr-2" />
									{isInterestMode ? "Register interest" : "Join waitlist"}
								</>
							)}
						</Button>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</form>
			</Form>
		);
	}

	return (
		<Card className="p-6 md:p-8">
			<div className="mb-6">
				<div className="flex items-center gap-2 mb-2">
					<Sparkles className="w-5 h-5 text-primary" />
					<h3 className="text-lg font-medium">
						{isInterestMode ? "Register your interest" : "Exclusive access"}
					</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					{isInterestMode
						? "We're currently live in Ghana and Nigeria. Join our expansion list and we'll notify you as soon as we launch in your country."
						: "Request early access and be the first to experience Salon Magik. We'll notify you when access is ready."}
				</p>
			</div>

			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<FormField
							control={form.control}
							name="first_name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>First name *</FormLabel>
									<FormControl>
										<Input placeholder="First name" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="last_name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Last name *</FormLabel>
									<FormControl>
										<Input placeholder="Last name" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Email *</FormLabel>
								<FormControl>
									<Input
										type="email"
										placeholder="you@example.com"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="phone"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Phone *</FormLabel>
								<FormControl>
									<PhoneInput
										value={field.value}
										onChange={field.onChange}
										defaultCountry="GH"
										placeholder="Phone number"
										hasError={!!form.formState.errors.phone}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="country"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Country *</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select your country" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{COUNTRIES.map((country) => (
											<SelectItem key={country.code} value={country.code}>
												{country.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="plan_interest"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Plan interest (optional)</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Which plan interests you?" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="solo">Solo - Just me</SelectItem>
										<SelectItem value="studio">Studio - Small team</SelectItem>
										<SelectItem value="chain">
											Chain - Multiple locations
										</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="team_size"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Team size (optional)</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="How many people on your team?" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="1">Just me</SelectItem>
										<SelectItem value="2-5">2-5 people</SelectItem>
										<SelectItem value="6-10">6-10 people</SelectItem>
										<SelectItem value="11+">11+ people</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="notes"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Anything else? (optional)</FormLabel>
								<FormControl>
									<Textarea
										placeholder="Tell us about your team, locations, or tools you use."
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<Button type="submit" className="w-full" disabled={isSubmitting}>
						{isSubmitting ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin mr-2" />
								Submitting...
							</>
						) : isInterestMode ? (
							"Register interest"
						) : (
							"Join waitlist"
						)}
					</Button>
				</form>
			</Form>
		</Card>
	);
}
