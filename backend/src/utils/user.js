export const publicUser = user => ({ _id: user._id, name: user.name, email: user.email, role: user.role, interests: user.interests, createdAt: user.createdAt, updatedAt: user.updatedAt });
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
