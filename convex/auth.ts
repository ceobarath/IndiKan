import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

const allowedEmail = process.env.AUTH_ALLOWED_EMAIL?.toLowerCase();

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: (params) => {
        const email = String(params.email ?? "").toLowerCase();
        if (allowedEmail && email !== allowedEmail) {
          throw new Error("Unauthorized");
        }
        return {
          email,
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const email = args.profile.email?.toLowerCase();
      if (!email) {
        throw new Error("Email required");
      }
      if (allowedEmail && email !== allowedEmail) {
        throw new Error("Unauthorized");
      }

      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, {
          email,
          emailVerificationTime: args.profile.emailVerified
            ? Date.now()
            : undefined,
        });
        return args.existingUserId;
      }

      return await ctx.db.insert("users", {
        email,
        emailVerificationTime: args.profile.emailVerified
          ? Date.now()
          : undefined,
      });
    },
  },
});
