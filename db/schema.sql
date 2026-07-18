
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `cases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_code` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL,
  `locked_at` datetime DEFAULT NULL,
  `accident_at` datetime DEFAULT NULL,
  `place_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `injuries` tinyint(1) DEFAULT NULL,
  `integrity_score` smallint DEFAULT NULL,
  `verdict` varchar(24) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_score` smallint DEFAULT NULL,
  `fraud_risk` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low',
  `fraud_flagged` tinyint(1) NOT NULL DEFAULT '0',
  `fraud_summary` text COLLATE utf8mb4_unicode_ci,
  `analysed_by` varchar(48) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimate_total` decimal(10,2) DEFAULT NULL,
  `currency` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TND',
  `synced_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `case_id` (`case_id`),
  KEY `idx_fraud_risk` (`fraud_risk`),
  KEY `idx_fraud_flagged` (`fraud_flagged`),
  KEY `idx_locked_at` (`locked_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `constats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `constats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` char(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `language` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fr',
  `circumstances` json DEFAULT NULL,
  `croquis` json DEFAULT NULL,
  `observations` text COLLATE utf8mb4_unicode_ci,
  `signed_at` datetime DEFAULT NULL,
  `generated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_constat_role` (`case_id`,`role`),
  CONSTRAINT `fk_constat_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `damage_photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `damage_photos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` char(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `side` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `damage_ratio` decimal(6,4) NOT NULL DEFAULT '0.0000',
  `region_count` smallint NOT NULL DEFAULT '0',
  `confidence` decimal(4,3) NOT NULL DEFAULT '0.000',
  PRIMARY KEY (`id`),
  KEY `fk_photo_case` (`case_id`),
  CONSTRAINT `fk_photo_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fraud_findings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fraud_findings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` char(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `code` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detail` text COLLATE utf8mb4_unicode_ci,
  `origin` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rules',
  PRIMARY KEY (`id`),
  KEY `fk_fraud_case` (`case_id`),
  CONSTRAINT `fk_fraud_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `participants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` char(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cin` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licence_no` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insurer` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `plate` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_verified` tinyint(1) NOT NULL DEFAULT '0',
  `simulated` tinyint(1) NOT NULL DEFAULT '0',
  `impact_zone` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `statement_raw` text COLLATE utf8mb4_unicode_ci,
  `statement_summary` text COLLATE utf8mb4_unicode_ci,
  `statement_langs` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimed_direction` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `movement` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fault_claim` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confirmed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_case_role` (`case_id`,`role`),
  CONSTRAINT `fk_part_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_estimates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_estimates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` char(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_key` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_label` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parts_cost` decimal(10,2) NOT NULL DEFAULT '0.00',
  `labour_cost` decimal(10,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TND',
  `source` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_est_case` (`case_id`),
  CONSTRAINT `fk_est_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

