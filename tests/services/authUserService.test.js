import { jest } from "@jest/globals";

// Mock all dependencies before importing
jest.unstable_mockModule("../../models/userModel.js", () => ({
  default: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.unstable_mockModule("../../models/refreshTokenModel.js", () => ({
  default: {
    create: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

jest.unstable_mockModule("../../utils/jwt.js", () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  setAccessTokenCookies: jest.fn(),
  setRefreshTokenCookies: jest.fn(),
}));

jest.unstable_mockModule("../../middlewares/appError.js", () => ({
  default: jest.fn(),
}));

jest.unstable_mockModule("../../utils/helpers.js", () => ({
  comparePassword: jest.fn(),
  calculateRefreshExpiresAt: jest.fn(),
  generateSessionId: jest.fn(),
}));

jest.unstable_mockModule("../../config/constants.js", () => ({
  userRefreshTokenPath: "/refresh",
}));

// Import after mocking
const { loginUserService, refreshUserAccessTokenService, logoutUserService } =
  await import("../../services/authUserService.js");
const User = (await import("../../models/userModel.js")).default;
const RefreshToken = (await import("../../models/refreshTokenModel.js"))
  .default;
const {
  generateAccessToken,
  generateRefreshToken,
  setAccessTokenCookies,
  setRefreshTokenCookies,
} = await import("../../utils/jwt.js");
const AppError = (await import("../../middlewares/appError.js")).default;
const { comparePassword, calculateRefreshExpiresAt, generateSessionId } =
  await import("../../utils/helpers.js");

describe("AuthUserService", () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    res = {
      clearCookie: jest.fn(),
    };

    // Set up environment variables
    process.env.JWT_ACCESS_EXPIRATION = "15m";
    process.env.JWT_REFRESH_EXPIRATION = "7d";
    process.env.JWT_ACCESS_SECRET = "test-access-secret";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  });

  describe("loginUserService", () => {
    it("should login user with email successfully", async () => {
      const mockUser = {
        _id: "user123",
        name: "John Doe",
        email: "john@example.com",
        phone: "1234567890",
        password: "hashedPassword",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      User.findOne.mockResolvedValue(mockUser);
      comparePassword.mockResolvedValue(true);
      generateSessionId.mockReturnValue("session123");
      generateAccessToken.mockReturnValue("accessToken123");
      generateRefreshToken.mockReturnValue("refreshToken123");
      calculateRefreshExpiresAt.mockReturnValue(new Date());
      RefreshToken.create.mockResolvedValue({});

      const result = await loginUserService(
        "john@example.com",
        "password123",
        res
      );

      expect(User.findOne).toHaveBeenCalledWith({ email: "john@example.com" });
      expect(comparePassword).toHaveBeenCalledWith(
        "password123",
        "hashedPassword"
      );
      expect(generateAccessToken).toHaveBeenCalled();
      expect(generateRefreshToken).toHaveBeenCalled();
      expect(RefreshToken.create).toHaveBeenCalled();
      expect(setAccessTokenCookies).toHaveBeenCalledWith(res, "accessToken123");
      expect(setRefreshTokenCookies).toHaveBeenCalledWith(
        res,
        "refreshToken123"
      );
      expect(result).toHaveProperty("accessToken", "accessToken123");
      expect(result).toHaveProperty("refreshToken", "refreshToken123");
      expect(result.user).toHaveProperty("email", "john@example.com");
    });

    it("should login user with phone successfully", async () => {
      const mockUser = {
        _id: "user123",
        name: "John Doe",
        email: "john@example.com",
        phone: "1234567890",
        password: "hashedPassword",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      User.findOne.mockResolvedValue(mockUser);
      comparePassword.mockResolvedValue(true);
      generateSessionId.mockReturnValue("session123");
      generateAccessToken.mockReturnValue("accessToken123");
      generateRefreshToken.mockReturnValue("refreshToken123");
      calculateRefreshExpiresAt.mockReturnValue(new Date());
      RefreshToken.create.mockResolvedValue({});

      const result = await loginUserService("1234567890", "password123", res);

      expect(User.findOne).toHaveBeenCalledWith({ phone: "1234567890" });
      expect(result).toHaveProperty("accessToken", "accessToken123");
    });

    it("should throw error for invalid identifier", async () => {
      AppError.mockImplementation((message, code, details) => {
        const error = new Error(message);
        error.statusCode = code;
        error.errors = details.errors;
        return error;
      });

      await expect(
        loginUserService("invalid", "password123", res)
      ).rejects.toThrow();
    });

    it("should throw error when user not found", async () => {
      User.findOne.mockResolvedValue(null);
      AppError.mockImplementation((message, code, details) => {
        const error = new Error(message);
        error.statusCode = code;
        error.errors = details.errors;
        return error;
      });

      await expect(
        loginUserService("john@example.com", "password123", res)
      ).rejects.toThrow();
    });

    it("should throw error for incorrect password", async () => {
      const mockUser = {
        _id: "user123",
        password: "hashedPassword",
      };

      User.findOne.mockResolvedValue(mockUser);
      comparePassword.mockResolvedValue(false);
      AppError.mockImplementation((message, code, details) => {
        const error = new Error(message);
        error.statusCode = code;
        error.errors = details.errors;
        return error;
      });

      await expect(
        loginUserService("john@example.com", "wrongpassword", res)
      ).rejects.toThrow();
    });
  });

  describe("refreshUserAccessTokenService", () => {
    it("should refresh access token successfully", async () => {
      const mockUser = { id: "user123" };
      const mockTokenRecord = {
        userId: "user123",
        sessionId: "session123",
        token: "refreshToken123",
      };
      const mockUserRecord = {
        _id: "user123",
        name: "John Doe",
        email: "john@example.com",
        phone: "1234567890",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      RefreshToken.findOne.mockResolvedValue(mockTokenRecord);
      User.findById.mockResolvedValue(mockUserRecord);
      generateAccessToken.mockReturnValue("newAccessToken123");

      const result = await refreshUserAccessTokenService(
        "refreshToken123",
        mockUser,
        res
      );

      expect(RefreshToken.findOne).toHaveBeenCalledWith({
        token: "refreshToken123",
        userId: "user123",
      });
      expect(User.findById).toHaveBeenCalledWith("user123");
      expect(generateAccessToken).toHaveBeenCalled();
      expect(setAccessTokenCookies).toHaveBeenCalledWith(
        res,
        "newAccessToken123"
      );
      expect(result).toHaveProperty("accessToken", "newAccessToken123");
    });

    it("should throw error when refresh token is missing", async () => {
      AppError.mockImplementation((message, code, details) => {
        const error = new Error(message);
        error.statusCode = code;
        error.errors = details.errors;
        return error;
      });

      await expect(
        refreshUserAccessTokenService(null, { id: "user123" }, res)
      ).rejects.toThrow();
    });

    it("should throw error when token record not found", async () => {
      RefreshToken.findOne.mockResolvedValue(null);
      AppError.mockImplementation((message, code, details) => {
        const error = new Error(message);
        error.statusCode = code;
        error.errors = details.errors;
        return error;
      });

      await expect(
        refreshUserAccessTokenService("invalidToken", { id: "user123" }, res)
      ).rejects.toThrow();
    });
  });

  describe("logoutUserService", () => {
    it("should logout user successfully", async () => {
      const mockUser = {
        id: "user123",
        sessionId: "session123",
      };

      RefreshToken.deleteOne.mockResolvedValue({ acknowledged: true });

      const result = await logoutUserService(mockUser, res);

      expect(RefreshToken.deleteOne).toHaveBeenCalledWith({
        userId: "user123",
        sessionId: "session123",
      });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty("deleted", true);
    });
  });
});
