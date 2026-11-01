import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    console.log(`MongoDB connected`);
  } catch (error) {
    console.error(`Database Initialization Error: ${error.message}`);
    process.exit(1); // Exit process with failure
  }
};
